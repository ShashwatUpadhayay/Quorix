import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { closeMongoClient } from "../lib/mongodb";
import { cosineSimilarity, embedText } from "../lib/questionPipeline/embeddings";
import { getLlmClientInfo } from "../lib/questionPipeline/llm";
import { runPipeline } from "../lib/questionPipeline/pipeline";

interface EvalProfile {
  id: string;
  level: "Foundational" | "Intermediate" | "Senior" | "Staff";
  experienceYears: number;
  interviewType: "coding" | "technical" | "system_design" | "behavioral";
  focus: string;
  tags: string[];
  primaryTopics: string[];
  focusAreas: string[];
}

const PROFILES: EvalProfile[] = [
  {
    id: "junior-backend",
    level: "Foundational",
    experienceYears: 1,
    interviewType: "technical",
    focus: "Node.js",
    tags: ["Node.js", "Express", "REST", "MongoDB", "Jest"],
    primaryTopics: ["Backend & APIs"],
    focusAreas: ["REST APIs", "MongoDB"],
  },
  {
    id: "mid-backend",
    level: "Intermediate",
    experienceYears: 3,
    interviewType: "technical",
    focus: "FastAPI",
    tags: ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker"],
    primaryTopics: ["Backend & APIs", "Databases & Storage"],
    focusAreas: ["FastAPI", "PostgreSQL", "Redis"],
  },
  {
    id: "senior-backend",
    level: "Senior",
    experienceYears: 6,
    interviewType: "technical",
    focus: "Go",
    tags: ["Go", "gRPC", "PostgreSQL", "Kafka", "Kubernetes"],
    primaryTopics: ["Backend & APIs", "Distributed Systems"],
    focusAreas: ["gRPC", "Kafka", "PostgreSQL"],
  },
  {
    id: "staff-platform",
    level: "Staff",
    experienceYears: 10,
    interviewType: "system_design",
    focus: "Distributed Systems",
    tags: ["Kafka", "Raft", "Kubernetes", "Terraform", "Prometheus"],
    primaryTopics: ["Distributed Systems", "Cloud & DevOps"],
    focusAreas: ["Kafka", "Kubernetes", "Consensus"],
  },
  {
    id: "junior-frontend",
    level: "Foundational",
    experienceYears: 1,
    interviewType: "technical",
    focus: "React",
    tags: ["React", "TypeScript", "CSS", "Vite"],
    primaryTopics: ["Frontend & UI"],
    focusAreas: ["React", "TypeScript"],
  },
  {
    id: "mid-frontend",
    level: "Intermediate",
    experienceYears: 3,
    interviewType: "technical",
    focus: "Next.js",
    tags: ["Next.js", "React", "TypeScript", "Tailwind", "Playwright"],
    primaryTopics: ["Frontend & UI"],
    focusAreas: ["Next.js", "React", "Core Web Vitals"],
  },
  {
    id: "senior-frontend",
    level: "Senior",
    experienceYears: 7,
    interviewType: "technical",
    focus: "React",
    tags: ["React", "TypeScript", "Design Systems", "Accessibility", "Webpack"],
    primaryTopics: ["Frontend & UI"],
    focusAreas: ["React", "Design Systems", "Accessibility"],
  },
  {
    id: "mid-dba",
    level: "Intermediate",
    experienceYears: 4,
    interviewType: "technical",
    focus: "PostgreSQL",
    tags: ["PostgreSQL", "SQL", "Indexing", "Redis", "Prisma"],
    primaryTopics: ["Databases & Storage"],
    focusAreas: ["PostgreSQL", "Query optimization"],
  },
  {
    id: "senior-data",
    level: "Senior",
    experienceYears: 6,
    interviewType: "technical",
    focus: "Data Engineering",
    tags: ["Airflow", "dbt", "Snowflake", "Spark", "Python"],
    primaryTopics: ["Data Engineering"],
    focusAreas: ["Airflow", "dbt", "Data quality"],
  },
  {
    id: "staff-data",
    level: "Staff",
    experienceYears: 11,
    interviewType: "system_design",
    focus: "Streaming",
    tags: ["Kafka", "Flink", "BigQuery", "Airflow", "Data Quality"],
    primaryTopics: ["Data Engineering", "Distributed Systems"],
    focusAreas: ["Streaming", "Data quality"],
  },
  {
    id: "mid-ml",
    level: "Intermediate",
    experienceYears: 3,
    interviewType: "technical",
    focus: "LLM Applications",
    tags: ["Python", "LangChain", "RAG", "OpenAI", "Vector Search"],
    primaryTopics: ["AI & ML Systems"],
    focusAreas: ["RAG", "LLM evaluation"],
  },
  {
    id: "senior-ml",
    level: "Senior",
    experienceYears: 7,
    interviewType: "technical",
    focus: "RAG",
    tags: ["PyTorch", "RAG", "Embeddings", "MLOps", "Evaluation"],
    primaryTopics: ["AI & ML Systems"],
    focusAreas: ["RAG", "Model evaluation", "Guardrails"],
  },
  {
    id: "mid-devops",
    level: "Intermediate",
    experienceYears: 4,
    interviewType: "technical",
    focus: "Kubernetes",
    tags: ["Kubernetes", "Docker", "Terraform", "AWS", "Prometheus"],
    primaryTopics: ["Cloud & DevOps"],
    focusAreas: ["Kubernetes", "Terraform", "Observability"],
  },
  {
    id: "senior-sre",
    level: "Senior",
    experienceYears: 8,
    interviewType: "system_design",
    focus: "AWS",
    tags: ["AWS", "Kubernetes", "Terraform", "Prometheus", "SLOs"],
    primaryTopics: ["Cloud & DevOps", "Distributed Systems"],
    focusAreas: ["Reliability", "Cost optimization", "SLOs"],
  },
  {
    id: "mid-security",
    level: "Intermediate",
    experienceYears: 4,
    interviewType: "technical",
    focus: "AppSec",
    tags: ["OAuth", "OWASP", "JWT", "Playwright", "TLS"],
    primaryTopics: ["Security & Testing"],
    focusAreas: ["OAuth", "OWASP", "Test automation"],
  },
  {
    id: "senior-security",
    level: "Senior",
    experienceYears: 7,
    interviewType: "technical",
    focus: "Security",
    tags: ["RBAC", "OWASP", "Encryption", "SBOM", "Threat Modeling"],
    primaryTopics: ["Security & Testing"],
    focusAreas: ["Authorization", "Supply chain security"],
  },
  {
    id: "mid-coding",
    level: "Intermediate",
    experienceYears: 3,
    interviewType: "coding",
    focus: "Algorithms",
    tags: ["Python", "Algorithms", "Data Structures", "Dynamic Programming"],
    primaryTopics: ["Algorithms & Data Structures"],
    focusAreas: ["Arrays", "Graphs", "Dynamic Programming"],
  },
  {
    id: "senior-coding",
    level: "Senior",
    experienceYears: 6,
    interviewType: "coding",
    focus: "Algorithms",
    tags: ["Go", "Algorithms", "Graphs", "Heaps", "Complexity"],
    primaryTopics: ["Algorithms & Data Structures"],
    focusAreas: ["Graphs", "Heaps", "Complexity analysis"],
  },
  {
    id: "senior-behavioral",
    level: "Senior",
    experienceYears: 8,
    interviewType: "behavioral",
    focus: "Engineering Leadership",
    tags: ["Mentoring", "Incident Management", "Technical Strategy", "Hiring"],
    primaryTopics: ["Engineering Leadership"],
    focusAreas: ["Mentoring", "Incident management", "Strategy"],
  },
  {
    id: "staff-behavioral",
    level: "Staff",
    experienceYears: 12,
    interviewType: "behavioral",
    focus: "Engineering Leadership",
    tags: ["Strategy", "Stakeholder Communication", "Hiring", "Org Design"],
    primaryTopics: ["Engineering Leadership"],
    focusAreas: ["Technical strategy", "Stakeholder communication"],
  },
];

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeAnswer(profile: EvalProfile, questionText: string, index: number): string {
  const tags = profile.tags.slice(0, 4).join(", ");
  return `I would start by clarifying the constraints around ${tags}. In a previous role I handled a similar situation by measuring the failure mode first, then applying a trade-off between latency and consistency. For "${questionText.slice(
    0,
    90
  )}..." I would instrument the critical path, add idempotency and rollback where needed, and verify the result with metrics. (eval answer ${index})`;
}

async function main(): Promise<void> {
  const providerArg = readArg("provider");
  if (providerArg === "gemini" || providerArg === "ollama") {
    process.env.LLM_PROVIDER = providerArg;
  }
  const modelArg = readArg("model");
  if (modelArg) {
    if (process.env.LLM_PROVIDER === "gemini") process.env.GEMINI_MODEL = modelArg;
    else process.env.OLLAMA_MODEL = modelArg;
  }

  const questionsPerProfile = Math.max(1, Number(readArg("questions", "5")) || 5);
  const maxProfiles = Math.max(1, Number(readArg("max-profiles", "20")) || 20);
  const sleepMs = Math.max(0, Number(readArg("sleep", "150")) || 150);
  const requestedMode = (readArg("mode", "auto") || "auto") as
    | "auto"
    | "select"
    | "generate";

  const info = getLlmClientInfo();
  const runId = `eval-${Date.now()}`;
  const profiles = PROFILES.slice(0, maxProfiles);
  const results: Array<Record<string, unknown>> = [];
  const csvRows: string[] = [
    "profile_id,question_number,stage,difficulty,source,accepted,duplicate_similarity,latency_ms,question,manual_rating_1_5",
  ];

  let total = 0;
  let accepted = 0;
  let duplicates = 0;
  let fallbacks = 0;
  let latencyTotal = 0;

  console.log(
    `[eval] run=${runId} provider=${info.provider} model=${info.model} profiles=${profiles.length} questions=${questionsPerProfile} mode=${requestedMode}`
  );

  for (const profile of profiles) {
    const askedIds: string[] = [];
    const askedTexts: string[] = [];
    const askedEmbeddings: number[][] = [];
    let lastQuestion: string | undefined;
    let lastAnswer: string | undefined;
    let lastScore: number | undefined;

    for (let questionNumber = 1; questionNumber <= questionsPerProfile; questionNumber += 1) {
      const startedAt = Date.now();
      let run;
      try {
        run = await runPipeline({
          sessionId: `${runId}-${profile.id}`,
          questionNumber,
          plannedQuestionCount: questionsPerProfile,
          interviewType: profile.interviewType,
          focus: profile.focus,
          profile: {
            tags: profile.tags,
            experienceYears: profile.experienceYears,
            primaryTopics: profile.primaryTopics,
            focusAreas: profile.focusAreas,
            level: profile.level,
          },
          askedQuestionIds: askedIds,
          askedQuestionTexts: askedTexts,
          lastQuestion,
          lastAnswer,
          lastScore,
          mode:
            questionNumber === 1 && requestedMode === "auto"
              ? "select"
              : requestedMode,
        });
      } catch (error) {
        console.warn(
          `[eval] ${profile.id} q${questionNumber} failed:`,
          error instanceof Error ? error.message : error
        );
        total += 1;
        results.push({
          profileId: profile.id,
          questionNumber,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const latency = Date.now() - startedAt;
      latencyTotal += latency;
      total += 1;

      const question = run.response.question;
      const embedding = await embedText(question.text);
      const duplicateSimilarity =
        askedEmbeddings.length > 0
          ? Math.max(
              ...askedEmbeddings.map((previous) =>
                cosineSimilarity(embedding, previous)
              )
            )
          : 0;

      if (run.response.accepted) accepted += 1;
      if (duplicateSimilarity >= 0.86) duplicates += 1;
      if (run.response.fallbackUsed) fallbacks += 1;

      askedIds.push(question.id);
      askedTexts.push(question.text);
      askedEmbeddings.push(embedding);

      lastQuestion = question.text;
      lastAnswer = fakeAnswer(profile, question.text, questionNumber);
      lastScore = 6 + ((profile.id.length + questionNumber) % 4);

      results.push({
        profileId: profile.id,
        level: profile.level,
        interviewType: profile.interviewType,
        questionNumber,
        stage: run.response.question.stage,
        targetDifficulty: run.diagnostics.targetDifficulty,
        difficulty: question.difficulty,
        source: run.response.source,
        accepted: run.response.accepted,
        fallbackUsed: run.response.fallbackUsed,
        attempts: run.response.attempts,
        latencyMs: latency,
        duplicateSimilarity: Number(duplicateSimilarity.toFixed(3)),
        reason: run.response.reason,
        question: question.text,
      });

      const csvText = `"${question.text.replace(/"/g, '""')}"`;
      csvRows.push(
        [
          profile.id,
          questionNumber,
          question.stage,
          question.difficulty,
          run.response.source,
          run.response.accepted ? "yes" : "no",
          duplicateSimilarity.toFixed(3),
          latency,
          csvText,
          "",
        ].join(",")
      );

      if (sleepMs > 0) await sleep(sleepMs);
    }
  }

  const report = {
    runId,
    provider: info.provider,
    model: info.model,
    embeddingModel: process.env.EMBEDDING_PROVIDER || "local",
    mode: requestedMode,
    questionsPerProfile,
    profiles: profiles.length,
    metrics: {
      total,
      accepted,
      passRate: total > 0 ? Number((accepted / total).toFixed(3)) : 0,
      duplicateRate: total > 0 ? Number((duplicates / total).toFixed(3)) : 0,
      fallbackRate: total > 0 ? Number((fallbacks / total).toFixed(3)) : 0,
      averageLatencyMs: total > 0 ? Math.round(latencyTotal / total) : 0,
    },
    results,
  };

  const outPath =
    readArg("out") || `pipeline-eval-${info.provider}-${Date.now()}.json`;
  const csvPath =
    readArg("csv") || `pipeline-eval-${info.provider}-${Date.now()}.csv`;
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(csvPath, csvRows.join("\n"), "utf8");

  console.log("[eval] Metrics:", report.metrics);
  console.log(`[eval] JSON report: ${outPath}`);
  console.log(`[eval] CSV for manual ratings: ${csvPath}`);

  if (hasFlag("strict")) {
    const maxDuplicateRate = Number(readArg("max-duplicate-rate", "0.15"));
    const minPassRate = Number(readArg("min-pass-rate", "0.75"));
    if (
      report.metrics.duplicateRate > maxDuplicateRate ||
      report.metrics.passRate < minPassRate
    ) {
      console.error(
        `[eval] Strict gate failed: passRate=${report.metrics.passRate} (min ${minPassRate}), duplicateRate=${report.metrics.duplicateRate} (max ${maxDuplicateRate})`
      );
      process.exitCode = 1;
    }
  }
}

main()
  .then(() => closeMongoClient())
  .catch(async (error) => {
    console.error("[eval] Fatal:", error);
    await closeMongoClient();
    process.exitCode = 1;
  });
