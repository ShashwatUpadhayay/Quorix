import "dotenv/config";
import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import { closeMongoClient, getDatabase } from "../lib/mongodb";
import {
  ensureQuestionIndexes,
  invalidateBankCache,
  type QuestionDoc,
} from "../lib/questionPipeline/bank";
import {
  embedTexts,
  getEmbeddingModelId,
} from "../lib/questionPipeline/embeddings";

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

async function main(): Promise<void> {
  await ensureQuestionIndexes();
  const db = await getDatabase();
  const collection = db.collection<QuestionDoc>("questions");
  const model = getEmbeddingModelId();
  const force = hasFlag("force");
  const all = hasFlag("all");
  const dryRun = hasFlag("dry-run");
  const limit = Math.max(0, Number(readArg("limit", "0")) || 0);

  const filter: Record<string, unknown> = all
    ? {}
    : { status: "approved" as const };

  let query = collection.find(filter).sort({ updatedAt: -1 });
  if (limit > 0) query = query.limit(limit);
  const docs = await query.toArray();

  const needsEmbedding = docs.filter(
    (doc) =>
      force ||
      !Array.isArray(doc.embedding) ||
      doc.embedding.length === 0 ||
      doc.embeddingModel !== model
  );

  console.log(
    `[embed] model=${model} scanned=${docs.length} toEmbed=${needsEmbedding.length}`
  );

  if (needsEmbedding.length === 0 || dryRun) {
    if (dryRun) {
      needsEmbedding.slice(0, 10).forEach((doc) => {
        console.log(`- ${doc._id?.toString()} ${doc.topic} / ${doc.subtopic}`);
      });
    }
    return;
  }

  let updated = 0;
  const batchSize = 50;

  for (let start = 0; start < needsEmbedding.length; start += batchSize) {
    const batch = needsEmbedding.slice(start, start + batchSize);
    const vectors = await embedTexts(batch.map((doc) => doc.text));

    const operations: AnyBulkWriteOperation<QuestionDoc>[] = batch.map(
      (doc, index) => ({
        updateOne: {
          filter: { _id: doc._id as ObjectId },
          update: {
            $set: {
              embedding: vectors[index],
              embeddingModel: model,
              updatedAt: new Date(),
            },
          },
        },
      })
    );

    const result = await collection.bulkWrite(operations, { ordered: false });
    updated += result.modifiedCount + result.matchedCount;
    console.log(
      `[embed] ${Math.min(start + batchSize, needsEmbedding.length)}/${needsEmbedding.length}`
    );
  }

  invalidateBankCache();
  console.log(`[embed] Done. Updated ${updated} questions with ${model}.`);
}

main()
  .then(() => closeMongoClient())
  .catch(async (error) => {
    console.error("[embed] Fatal:", error);
    await closeMongoClient();
    process.exitCode = 1;
  });
