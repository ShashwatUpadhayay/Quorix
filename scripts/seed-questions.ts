import "dotenv/config";
import { closeMongoClient } from "../lib/mongodb";
import {
  ensureQuestionIndexes,
  insertQuestion,
  seedCuratedBank,
} from "../lib/questionPipeline/bank";
import {
  getLlmClient,
  getLlmClientInfo,
} from "../lib/questionPipeline/llm";
import {
  buildSeedPrompt,
  buildSystemPrompt,
  buildVariation,
} from "../lib/questionPipeline/prompts";
import {
  GeneratedQuestionListSchema,
  fingerprintQuestion,
  type GeneratedQuestion,
} from "../lib/questionPipeline/schemas";
import {
  QUESTION_TAXONOMY,
  PIPELINE_STAGES,
  getDomain,
  getSubtopic,
  type PipelineStage,
} from "../lib/questionPipeline/taxonomy";

interface Args {
  curated: boolean;
  dryRun: boolean;
  perCombo: number;
  maxCalls: number;
  difficulties: number[];
  stages: PipelineStage[];
  subtopicsPerDomain: number;
  sleepMs: number;
}

function readArg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  return fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseArgs(): Args {
  const full = hasFlag("full");
  const provider = readArg("provider");
  if (provider === "gemini" || provider === "ollama") {
    process.env.LLM_PROVIDER = provider;
  }
  const model = readArg("model");
  if (model) {
    if (provider === "gemini") process.env.GEMINI_MODEL = model;
    else process.env.OLLAMA_MODEL = model;
  }

  const difficulties = (readArg("difficulties", "2,3,4") || "2,3,4")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 5);

  const stages = (readArg("stages", PIPELINE_STAGES.join(",")) || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is PipelineStage =>
      (PIPELINE_STAGES as readonly string[]).includes(value)
    );

  return {
    curated: hasFlag("curated"),
    dryRun: hasFlag("dry-run"),
    perCombo: Math.max(1, Number(readArg("per-combo", "5")) || 5),
    maxCalls: full
      ? 0
      : Math.max(0, Number(readArg("max-calls", "30")) ?? 30),
    difficulties: difficulties.length > 0 ? difficulties : [2, 3, 4],
    stages: stages.length > 0 ? stages : [...PIPELINE_STAGES],
    subtopicsPerDomain: full
      ? 6
      : Math.max(1, Number(readArg("subtopics-per-domain", "2")) || 2),
    sleepMs: Math.max(0, Number(readArg("sleep", "250")) || 250),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = parseArgs();
  await ensureQuestionIndexes();

  if (args.curated) {
    const result = await seedCuratedBank({ force: true });
    console.log(
      `[seed] Curated fallback bank ready: ${result.inserted} rows written.`
    );
    return;
  }

  const info = getLlmClientInfo();
  if (info.provider === "gemini" && !process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is missing. Set it in .env or use --provider=ollama."
    );
  }

  console.log(
    `[seed] Provider=${info.provider} model=${info.model} perCombo=${args.perCombo} maxCalls=${args.maxCalls || "unlimited"}`
  );

  const llm = getLlmClient();
  let calls = 0;
  let inserted = 0;
  let duplicates = 0;
  let failed = 0;
  const batchFingerprints = new Set<string>();
  const recentTexts: string[] = [];
  const startedAt = Date.now();

  outer: for (const domain of QUESTION_TAXONOMY) {
    const subtopics = domain.subtopics.slice(0, args.subtopicsPerDomain);

    for (const subtopic of subtopics) {
      for (const stage of args.stages) {
        for (const difficulty of args.difficulties) {
          if (args.maxCalls > 0 && calls >= args.maxCalls) break outer;

          calls += 1;
          const prompt = buildSeedPrompt({
            domain: domain.name,
            domainDescription: domain.description,
            subtopic: subtopic.name,
            stage,
            difficulty,
            count: args.perCombo,
            variation: buildVariation(calls),
            existingQuestions: recentTexts.slice(-10),
          });

          console.log(
            `[seed] ${calls}${args.maxCalls ? `/${args.maxCalls}` : ""} ${domain.name} / ${subtopic.name} / ${stage} / d${difficulty}`
          );

          try {
            const completion = await llm.completeJson({
              schema: GeneratedQuestionListSchema,
              system: buildSystemPrompt(),
              prompt,
              temperature: 0.85,
              maxOutputTokens: Math.max(1200, args.perCombo * 320),
              timeoutMs: 60_000,
              label: `seed.${domain.name}.${subtopic.name}.${stage}.${difficulty}`,
            });

            for (const raw of completion.data.questions) {
              const topic = getDomain(raw.topic)?.name || domain.name;
              const resolvedSubtopic =
                getSubtopic(topic, raw.subtopic)?.name || subtopic.name;

              const question: GeneratedQuestion = {
                ...raw,
                topic,
                subtopic: resolvedSubtopic,
                stage,
                difficulty,
              };

              const fingerprint = fingerprintQuestion(question.text);
              if (batchFingerprints.has(fingerprint)) {
                duplicates += 1;
                continue;
              }
              batchFingerprints.add(fingerprint);
              recentTexts.push(question.text);
              if (recentTexts.length > 30) recentTexts.shift();

              if (args.dryRun) {
                console.log(JSON.stringify(question, null, 2));
                inserted += 1;
                continue;
              }

              const result = await insertQuestion({
                question,
                source: "seeded",
                status: "draft",
                provider: llm.provider,
                model: llm.model,
                reviewNotes: `Seeded ${new Date().toISOString()} for ${domain.name}/${subtopic.name}/${stage}/d${difficulty}`,
              });

              if (result.inserted) inserted += 1;
              else duplicates += 1;
            }
          } catch (error) {
            failed += 1;
            console.warn(
              `[seed] Call failed:`,
              error instanceof Error ? error.message : error
            );
          }

          if (args.sleepMs > 0) await sleep(args.sleepMs);
        }
      }
    }
  }

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[seed] Done in ${seconds}s. calls=${calls} inserted=${inserted} duplicates=${duplicates} failed=${failed}`
  );
  if (!args.dryRun && inserted > 0) {
    console.log(
      "[seed] Drafts are NOT retrievable yet. Review them at /admin/questions, approve, then run `npm run embed:bank` if needed."
    );
  }
}

main()
  .then(() => closeMongoClient())
  .catch(async (error) => {
    console.error("[seed] Fatal:", error);
    await closeMongoClient();
    process.exitCode = 1;
  });
