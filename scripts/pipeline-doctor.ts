import "dotenv/config";
import { closeMongoClient, getDatabase } from "../lib/mongodb";
import {
  ensureQuestionIndexes,
  getBankStats,
  seedCuratedBank,
} from "../lib/questionPipeline/bank";
import { getEmbeddingConfig } from "../lib/questionPipeline/embeddings";
import {
  checkOllamaReachable,
  getConfiguredProvider,
  getLlmClientInfo,
} from "../lib/questionPipeline/llm";
import {
  VALIDATION_THRESHOLDS,
} from "../lib/questionPipeline/validation";
import { DOMAIN_NAMES, QUESTION_TAXONOMY } from "../lib/questionPipeline/taxonomy";

async function main(): Promise<void> {
  const provider = getConfiguredProvider();
  const llm = getLlmClientInfo();
  const embedding = getEmbeddingConfig();

  console.log("=== Quorix question pipeline doctor ===");
  console.log(`LLM provider:      ${provider}`);
  console.log(`LLM model:         ${llm.model}`);
  console.log(
    `Gemini key:        ${
      process.env.GEMINI_API_KEY ? "present (server-side)" : "not set"
    }`
  );
  console.log(`Embedding provider:${embedding.provider}`);
  console.log(`Embedding model:   ${embedding.model}`);
  console.log(`Thresholds:        ${JSON.stringify(VALIDATION_THRESHOLDS)}`);
  console.log(`Taxonomy:          ${DOMAIN_NAMES.length} domains, ${QUESTION_TAXONOMY.reduce(
    (sum, domain) => sum + domain.subtopics.length,
    0
  )} subtopics`);

  try {
    const db = await getDatabase();
    await db.command({ ping: 1 });
    console.log("MongoDB:           reachable");
  } catch (error) {
    console.log(
      "MongoDB:           FAILED —",
      error instanceof Error ? error.message : error
    );
  }

  if (provider === "ollama") {
    const reachable = await checkOllamaReachable();
    console.log(`Ollama:            ${reachable ? "reachable" : "not reachable"}`);
  }

  try {
    await ensureQuestionIndexes();
    const seeded = await seedCuratedBank();
    console.log(
      `Curated bank:      ${seeded.skipped ? "already seeded" : `${seeded.inserted} rows written`}`
    );
    const stats = await getBankStats();
    console.log(
      `Bank stats:        total=${stats.total} approved=${stats.approved} draft=${stats.draft} rejected=${stats.rejected}`
    );
    console.log(
      `By source:         ${JSON.stringify(stats.bySource)}`
    );
    console.log(
      `Approved by domain:${stats.byDomain
        .map((row) => `${row.domain}=${row.approved}`)
        .join(", ")}`
    );
  } catch (error) {
    console.log(
      "Bank check:        FAILED —",
      error instanceof Error ? error.message : error
    );
  }
}

main()
  .then(() => closeMongoClient())
  .catch(async (error) => {
    console.error("[doctor] Fatal:", error);
    await closeMongoClient();
    process.exitCode = 1;
  });
