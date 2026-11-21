import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import { getDatabase } from "@/lib/mongodb";
import {
  CURATED_BANK_VERSION,
  CURATED_QUESTIONS,
} from "@/lib/questionPipeline/curatedBank";
import {
  cosineSimilarity,
  embedTexts,
  getEmbeddingModelId,
  tagOverlapScore,
} from "@/lib/questionPipeline/embeddings";
import {
  fingerprintQuestion,
  type CandidateProfile,
  type GeneratedQuestion,
  type QuestionSource,
  type QuestionStatus,
} from "@/lib/questionPipeline/schemas";
import type { PipelineStage } from "@/lib/questionPipeline/taxonomy";
import { normalizeDomainName, normalizeSubtopicName } from "@/lib/questionPipeline/taxonomy";

export interface QuestionDoc {
  _id?: ObjectId;
  text: string;
  topic: string;
  subtopic: string;
  difficulty: number;
  stage: PipelineStage;
  expectedPoints: string[];
  competencyTags: string[];
  status: QuestionStatus;
  source: QuestionSource;
  embedding?: number[];
  embeddingModel?: string;
  fingerprint: string;
  provider?: string;
  model?: string;
  createdAt: Date;
  updatedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  usageCount: number;
  lastUsedAt?: Date;
}

export interface BankQuestion extends QuestionDoc {
  id: string;
  embedding: number[];
}

interface BankCache {
  loadedAt: number;
  questions: BankQuestion[];
}

interface PipelineGlobal {
  _quorixBankCache?: BankCache;
  _quorixCuratedPromise?: Promise<{ inserted: number; skipped: boolean }>;
  _quorixIndexPromise?: Promise<void>;
}

const globalForPipeline = global as unknown as PipelineGlobal;
const BANK_CACHE_TTL_MS = 60_000;

export function invalidateBankCache(): void {
  globalForPipeline._quorixBankCache = undefined;
}

export async function ensureQuestionIndexes(): Promise<void> {
  if (!globalForPipeline._quorixIndexPromise) {
    globalForPipeline._quorixIndexPromise = (async () => {
      const db = await getDatabase();
      const collection = db.collection<QuestionDoc>("questions");
      await Promise.all([
        collection.createIndex({
          status: 1,
          topic: 1,
          stage: 1,
          difficulty: 1,
        }),
        collection.createIndex({ status: 1, source: 1 }),
        collection.createIndex({ fingerprint: 1 }),
        collection.createIndex({ updatedAt: -1 }),
        collection.createIndex({ status: 1, topic: 1, subtopic: 1 }),
      ]);
    })().catch((error) => {
      globalForPipeline._quorixIndexPromise = undefined;
      throw error;
    });
  }
  return globalForPipeline._quorixIndexPromise;
}

function normalizeQuestionDoc(doc: QuestionDoc): BankQuestion {
  return {
    ...doc,
    id: doc._id?.toString() || doc.fingerprint,
    embedding: Array.isArray(doc.embedding) ? doc.embedding : [],
  };
}

async function attachEmbeddings(
  docs: QuestionDoc[]
): Promise<QuestionDoc[]> {
  const model = getEmbeddingModelId();
  const needsEmbedding = docs.filter(
    (doc) =>
      !Array.isArray(doc.embedding) ||
      doc.embedding.length === 0 ||
      doc.embeddingModel !== model
  );

  if (needsEmbedding.length === 0) return docs;

  const vectors = await embedTexts(needsEmbedding.map((doc) => doc.text));
  const updates: AnyBulkWriteOperation<QuestionDoc>[] = needsEmbedding.map(
    (doc, index) => ({
      updateOne: {
        filter: { _id: doc._id as ObjectId },
        update: {
          $set: {
            embedding: vectors[index],
            embeddingModel: model,
          },
        },
      },
    })
  );

  if (updates.length > 0) {
    const db = await getDatabase();
    await db
      .collection<QuestionDoc>("questions")
      .bulkWrite(updates, { ordered: false })
      .catch((error) => {
        console.warn(
          "[QuestionBank] Could not persist lazily-computed embeddings:",
          error instanceof Error ? error.message : error
        );
      });
  }

  const byId = new Map<string, number[]>();
  needsEmbedding.forEach((doc, index) => {
    if (doc._id) byId.set(doc._id.toString(), vectors[index]);
  });

  return docs.map((doc) => {
    const vector = doc._id ? byId.get(doc._id.toString()) : undefined;
    return vector
      ? { ...doc, embedding: vector, embeddingModel: model }
      : doc;
  });
}

/**
 * Loads approved questions into process memory and guarantees that every row
 * has an embedding from the currently configured model.
 */
export async function loadApprovedQuestions(
  force = false
): Promise<BankQuestion[]> {
  const cached = globalForPipeline._quorixBankCache;
  if (
    !force &&
    cached &&
    Date.now() - cached.loadedAt < BANK_CACHE_TTL_MS
  ) {
    return cached.questions;
  }

  const db = await getDatabase();
  const docs = await db
    .collection<QuestionDoc>("questions")
    .find({ status: "approved" })
    .sort({ usageCount: 1, updatedAt: -1 })
    .limit(5_000)
    .toArray();

  const embedded = await attachEmbeddings(docs);
  const questions = embedded.map(normalizeQuestionDoc);

  globalForPipeline._quorixBankCache = {
    loadedAt: Date.now(),
    questions,
  };

  return questions;
}

export async function getQuestionById(id: string): Promise<QuestionDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDatabase();
  return db.collection<QuestionDoc>("questions").findOne({
    _id: new ObjectId(id),
  });
}

export interface SeedCuratedResult {
  inserted: number;
  skipped: boolean;
}

export async function seedCuratedBank(
  options: { force?: boolean } = {}
): Promise<SeedCuratedResult> {
  await ensureQuestionIndexes();
  const db = await getDatabase();
  const metaCollection = db.collection<{
    _id: string;
    version: string;
    count: number;
    updatedAt: Date;
  }>("pipeline_meta");
  const questionsCollection = db.collection<QuestionDoc>("questions");

  const [meta, curatedCount] = await Promise.all([
    metaCollection.findOne({ _id: "curated-bank" }),
    questionsCollection.countDocuments({ source: "curated" }),
  ]);

  if (
    !options.force &&
    meta?.version === CURATED_BANK_VERSION &&
    curatedCount >= CURATED_QUESTIONS.length
  ) {
    return { inserted: 0, skipped: true };
  }

  const embeddingModel = getEmbeddingModelId();
  let vectors: number[][] = [];
  try {
    vectors = await embedTexts(CURATED_QUESTIONS.map((question) => question.text));
  } catch (error) {
    console.warn(
      "[QuestionBank] Curated bank will be stored without embeddings:",
      error instanceof Error ? error.message : error
    );
  }

  const now = new Date();
  const operations: AnyBulkWriteOperation<QuestionDoc>[] = CURATED_QUESTIONS.map((question, index) => {
    const fingerprint = fingerprintQuestion(question.text);
    const topic = normalizeDomainName(question.topic);
    const subtopic = normalizeSubtopicName(topic, question.subtopic);
    const vector = vectors[index];

    return {
      updateOne: {
        filter: { fingerprint, source: "curated" },
        update: {
          $set: {
            text: question.text,
            topic,
            subtopic,
            difficulty: question.difficulty,
            stage: question.stage,
            expectedPoints: question.expectedPoints,
            competencyTags: question.competencyTags,
            status: "approved" as QuestionStatus,
            source: "curated" as QuestionSource,
            fingerprint,
            updatedAt: now,
            ...(vector
              ? { embedding: vector, embeddingModel }
              : {}),
          },
          $setOnInsert: {
            createdAt: now,
            usageCount: 0,
            reviewedAt: now,
            reviewNotes: `Curated fallback bank ${CURATED_BANK_VERSION}`,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await questionsCollection.bulkWrite(operations, {
    ordered: false,
  });

  await metaCollection.updateOne(
    { _id: "curated-bank" },
    {
      $set: {
        version: CURATED_BANK_VERSION,
        count: CURATED_QUESTIONS.length,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  invalidateBankCache();

  return {
    inserted:
      result.upsertedCount + result.modifiedCount + result.matchedCount,
    skipped: false,
  };
}

export async function ensureCuratedBank(): Promise<void> {
  if (!globalForPipeline._quorixCuratedPromise) {
    globalForPipeline._quorixCuratedPromise = seedCuratedBank().catch((error) => {
      globalForPipeline._quorixCuratedPromise = undefined;
      throw error;
    });
  }
  await globalForPipeline._quorixCuratedPromise;
}

export interface RetrievalParams {
  profile: CandidateProfile;
  profileEmbedding: number[];
  domain: string;
  stage: PipelineStage;
  targetDifficulty: number;
  excludeIds?: string[];
  limit?: number;
}

export interface RankedQuestion {
  question: BankQuestion;
  score: number;
  similarity: number;
  tagScore: number;
}

/**
 * Filters by stage/domain/difficulty, excludes asked ids and ranks the rest by
 * similarity to the candidate profile. If a strict filter would return too few
 * rows, it relaxes gracefully with a score penalty instead of failing.
 */
export async function retrieveCandidates(
  params: RetrievalParams
): Promise<RankedQuestion[]> {
  await ensureCuratedBank();
  const questions = await loadApprovedQuestions();
  const exclude = new Set(params.excludeIds || []);
  const limit = params.limit || 24;
  const normalizedDomain = normalizeDomainName(params.domain);

  const scored: RankedQuestion[] = [];

  for (const question of questions) {
    if (exclude.has(question.id)) continue;

    const difficultyDistance = Math.abs(
      question.difficulty - params.targetDifficulty
    );
    const exactStage = question.stage === params.stage;
    const exactDomain = question.topic === normalizedDomain;
    const withinDifficulty = difficultyDistance <= 1;

    const similarity = cosineSimilarity(
      params.profileEmbedding,
      question.embedding
    );
    const tagScore = tagOverlapScore(
      question.competencyTags,
      params.profile.tags,
      question.topic,
      question.subtopic
    );

    const stagePenalty = exactStage ? 0 : 0.18;
    const domainPenalty = exactDomain ? 0 : 0.12;
    const difficultyPenalty = withinDifficulty ? 0 : 0.08 + difficultyDistance * 0.04;
    const usagePenalty = Math.min(0.12, (question.usageCount || 0) * 0.008);
    const jitter = Math.random() * 0.035;

    const score =
      similarity * 0.5 +
      tagScore * 0.25 +
      (1 - Math.min(1, difficultyDistance / 4)) * 0.25 -
      stagePenalty -
      domainPenalty -
      difficultyPenalty -
      usagePenalty +
      jitter;

    scored.push({ question, score, similarity, tagScore });
  }

  scored.sort((a, b) => b.score - a.score);

  const strict = scored.filter(
    (item) =>
      item.question.stage === params.stage &&
      item.question.topic === normalizedDomain &&
      Math.abs(item.question.difficulty - params.targetDifficulty) <= 1
  );

  if (strict.length >= limit) return strict.slice(0, limit);

  const strictIds = new Set(strict.map((item) => item.question.id));
  const relaxed = scored.filter((item) => !strictIds.has(item.question.id));

  return [...strict, ...relaxed].slice(0, limit);
}

export async function markQuestionsUsed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const objectIds = ids
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (objectIds.length === 0) return;

  const db = await getDatabase();
  await db.collection<QuestionDoc>("questions").updateMany(
    { _id: { $in: objectIds } },
    {
      $inc: { usageCount: 1 },
      $set: { lastUsedAt: new Date() },
    }
  );
  invalidateBankCache();
}

export interface InsertQuestionResult {
  inserted: boolean;
  duplicate: boolean;
  id?: string;
}

export async function insertQuestion(params: {
  question: GeneratedQuestion;
  source: QuestionSource;
  status: QuestionStatus;
  provider?: string;
  model?: string;
  embedding?: number[];
  embeddingModel?: string;
  reviewNotes?: string;
}): Promise<InsertQuestionResult> {
  await ensureQuestionIndexes();
  const db = await getDatabase();
  const collection = db.collection<QuestionDoc>("questions");
  const fingerprint = fingerprintQuestion(params.question.text);
  const topic = normalizeDomainName(params.question.topic);
  const subtopic = normalizeSubtopicName(topic, params.question.subtopic);

  const existing = await collection.findOne({ fingerprint });
  if (existing) {
    return { inserted: false, duplicate: true, id: existing._id?.toString() };
  }

  const now = new Date();
  const doc: QuestionDoc = {
    text: params.question.text.trim(),
    topic,
    subtopic,
    difficulty: params.question.difficulty,
    stage: params.question.stage,
    expectedPoints: params.question.expectedPoints,
    competencyTags: params.question.competencyTags,
    status: params.status,
    source: params.source,
    fingerprint,
    provider: params.provider,
    model: params.model,
    embedding: params.embedding,
    embeddingModel: params.embeddingModel,
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
    reviewNotes: params.reviewNotes,
  };

  const result = await collection.insertOne(doc);
  invalidateBankCache();
  return {
    inserted: true,
    duplicate: false,
    id: result.insertedId.toString(),
  };
}

export interface ReviewResult {
  updated: boolean;
  question?: QuestionDoc;
}

export async function reviewQuestion(params: {
  id: string;
  action: "approve" | "reject" | "save" | "archive";
  updates?: Partial<
    Pick<
      QuestionDoc,
      | "text"
      | "topic"
      | "subtopic"
      | "difficulty"
      | "stage"
      | "expectedPoints"
      | "competencyTags"
      | "reviewNotes"
    >
  >;
  reviewer: string;
}): Promise<ReviewResult> {
  if (!ObjectId.isValid(params.id)) return { updated: false };
  const db = await getDatabase();
  const collection = db.collection<QuestionDoc>("questions");
  const existing = await collection.findOne({
    _id: new ObjectId(params.id),
  });
  if (!existing) return { updated: false };

  const updates = { ...(params.updates || {}) };
  if (updates.text) {
    updates.text = updates.text.trim();
  }
  if (updates.topic) {
    updates.topic = normalizeDomainName(updates.topic);
  }
  if (updates.topic && updates.subtopic) {
    updates.subtopic = normalizeSubtopicName(updates.topic, updates.subtopic);
  }

  const status: QuestionStatus =
    params.action === "approve"
      ? "approved"
      : params.action === "reject"
        ? "rejected"
        : params.action === "archive"
          ? "archived"
          : existing.status;

  const nextText = updates.text || existing.text;
  const fingerprint = fingerprintQuestion(nextText);
  const now = new Date();

  let embedding = existing.embedding;
  let embeddingModel = existing.embeddingModel;
  const model = getEmbeddingModelId();

  if (
    status === "approved" &&
    (!embedding ||
      embedding.length === 0 ||
      embeddingModel !== model ||
      updates.text)
  ) {
    try {
      const [vector] = await embedTexts([nextText]);
      embedding = vector;
      embeddingModel = model;
    } catch (error) {
      console.warn(
        "[QuestionBank] Could not embed approved question:",
        error instanceof Error ? error.message : error
      );
    }
  }

  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(params.id) },
    {
      $set: {
        ...updates,
        status,
        fingerprint,
        embedding,
        embeddingModel,
        reviewedBy: params.reviewer,
        reviewedAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );

  invalidateBankCache();
  return { updated: Boolean(result), question: result || undefined };
}

export interface BankStats {
  total: number;
  approved: number;
  draft: number;
  rejected: number;
  archived: number;
  bySource: Record<string, number>;
  byDomain: Array<{ domain: string; approved: number; draft: number }>;
  embeddingModel: string;
}

export async function getBankStats(): Promise<BankStats> {
  const db = await getDatabase();
  const collection = db.collection<QuestionDoc>("questions");

  const [statusAgg, sourceAgg, domainAgg] = await Promise.all([
    collection
      .aggregate<{ _id: QuestionStatus; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray(),
    collection
      .aggregate<{ _id: QuestionSource; count: number }>([
        { $group: { _id: "$source", count: { $sum: 1 } } },
      ])
      .toArray(),
    collection
      .aggregate<{
        _id: { topic: string; status: QuestionStatus };
        count: number;
      }>([
        {
          $group: {
            _id: { topic: "$topic", status: "$status" },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const statusCounts = Object.fromEntries(
    statusAgg.map((row) => [row._id, row.count])
  ) as Partial<Record<QuestionStatus, number>>;
  const bySource = Object.fromEntries(
    sourceAgg.map((row) => [row._id, row.count])
  ) as Record<string, number>;

  const domainMap = new Map<string, { approved: number; draft: number }>();
  for (const row of domainAgg) {
    const current = domainMap.get(row._id.topic) || { approved: 0, draft: 0 };
    if (row._id.status === "approved") current.approved += row.count;
    if (row._id.status === "draft") current.draft += row.count;
    domainMap.set(row._id.topic, current);
  }

  return {
    total: Object.values(statusCounts).reduce<number>(
      (sum, count) => sum + (count ?? 0),
      0
    ),
    approved: statusCounts.approved || 0,
    draft: statusCounts.draft || 0,
    rejected: statusCounts.rejected || 0,
    archived: statusCounts.archived || 0,
    bySource,
    byDomain: Array.from(domainMap.entries())
      .map(([domain, counts]) => ({ domain, ...counts }))
      .sort((a, b) => b.approved - a.approved),
    embeddingModel: getEmbeddingModelId(),
  };
}

export async function findNearDuplicate(params: {
  text: string;
  embedding: number[];
  threshold: number;
  excludeIds?: string[];
}): Promise<{ question: BankQuestion; similarity: number } | null> {
  const questions = await loadApprovedQuestions();
  const exclude = new Set(params.excludeIds || []);
  let best: { question: BankQuestion; similarity: number } | null = null;

  for (const question of questions) {
    if (exclude.has(question.id)) continue;
    const similarity = cosineSimilarity(params.embedding, question.embedding);
    if (similarity >= params.threshold && (!best || similarity > best.similarity)) {
      best = { question, similarity };
    }
  }

  return best;
}
