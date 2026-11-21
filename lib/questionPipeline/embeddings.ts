import type { CandidateProfile } from "@/lib/questionPipeline/schemas";

/**
 * Embedding provider abstraction.
 *
 * The important production rule: never mix models. Every stored vector carries
 * `embeddingModel`, and the bank loader re-embeds rows whose model does not
 * match the currently configured model.
 *
 * Default is a deterministic local hashed bag-of-words model. It has no native
 * dependencies and behaves identically in dev and prod, which keeps the first
 * version of the pipeline reproducible. Set EMBEDDING_PROVIDER=gemini to use
 * Gemini embeddings instead (server-side key only).
 */

const LOCAL_DIMENSIONS = Math.max(
  128,
  Math.min(1024, Number(process.env.EMBEDDING_DIMENSIONS) || 384)
);

const LOCAL_MODEL_ID = `local-hash-v1-${LOCAL_DIMENSIONS}`;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "so",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[./-]+|[./-]+$/g, ""))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function addHashed(vector: Float64Array, token: string, weight: number): void {
  const hash = fnv1a(token);
  const index = hash % vector.length;
  const sign = (hash >>> 16) & 1 ? 1 : -1;
  vector[index] += sign * weight;
}

function normalize(vector: Float64Array): number[] {
  let norm = 0;
  for (const value of vector) norm += value * value;
  if (norm === 0) return Array.from(vector);
  const divisor = Math.sqrt(norm);
  return Array.from(vector, (value) => value / divisor);
}

/**
 * Deterministic local embedding. Unigrams carry the main signal; bigrams help
 * distinguish phrases such as "cache invalidation" from unrelated words.
 */
export function localEmbedding(text: string): number[] {
  const vector = new Float64Array(LOCAL_DIMENSIONS);
  const tokens = tokenize(text);

  for (const token of tokens) {
    addHashed(vector, token, 1);
    addHashed(vector, `w:${token}`, 0.35);
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    addHashed(vector, `b:${tokens[index]}_${tokens[index + 1]}`, 0.7);
  }

  return normalize(vector);
}

export type EmbeddingProviderName = "local" | "gemini";

export interface EmbeddingConfig {
  provider: EmbeddingProviderName;
  model: string;
  dimensions: number;
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const provider =
    (process.env.EMBEDDING_PROVIDER || "local").toLowerCase() === "gemini"
      ? "gemini"
      : "local";

  if (provider === "gemini") {
    return {
      provider,
      model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
      dimensions: Number(process.env.GEMINI_EMBEDDING_DIMENSIONS) || 768,
    };
  }

  return {
    provider,
    model: LOCAL_MODEL_ID,
    dimensions: LOCAL_DIMENSIONS,
  };
}

export function getEmbeddingModelId(): string {
  return getEmbeddingConfig().model;
}

async function geminiEmbed(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is required when EMBEDDING_PROVIDER=gemini."
    );
  }

  const config = getEmbeddingConfig();
  const baseUrl =
    process.env.GEMINI_API_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta";
  const results: number[][] = [];
  const batchSize = 50;

  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(
        `${baseUrl}/models/${encodeURIComponent(config.model)}:batchEmbedContents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            requests: batch.map((text) => ({
              model: `models/${config.model}`,
              content: { parts: [{ text }] },
              taskType: "SEMANTIC_SIMILARITY",
              outputDimensionality: config.dimensions,
            })),
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Gemini embedding request failed (${response.status}): ${body.slice(0, 240)}`
        );
      }

      const payload = (await response.json()) as {
        embeddings?: Array<{ values?: number[] }>;
      };
      for (const embedding of payload.embeddings || []) {
        results.push(embedding.values || []);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (results.length !== texts.length) {
    throw new Error(
      `Gemini embedding count mismatch: expected ${texts.length}, received ${results.length}.`
    );
  }

  return results;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const config = getEmbeddingConfig();
  if (config.provider === "gemini") {
    return geminiEmbed(texts);
  }
  return texts.map((text) => localEmbedding(text));
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function maxCosineSimilarity(
  vector: number[],
  others: number[][]
): number {
  let max = 0;
  for (const other of others) {
    const similarity = cosineSimilarity(vector, other);
    if (similarity > max) max = similarity;
  }
  return max;
}

export function buildProfileEmbeddingText(profile: CandidateProfile): string {
  const parts = [
    profile.headline || "",
    profile.level || "",
    ...profile.tags,
    ...profile.primaryTopics,
    ...profile.focusAreas,
  ].filter(Boolean);
  return parts.join(". ");
}

/**
 * Cheap tag-level relevance signal. Handles the common case where a question
 * explicitly names a technology the candidate listed, without depending on the
 * embedding model's calibration.
 */
export function tagOverlapScore(
  questionTags: string[],
  profileTags: string[],
  topic?: string,
  subtopic?: string
): number {
  const profileSet = new Set(
    profileTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)
  );
  if (profileSet.size === 0) return 0;

  const questionTagsLower = questionTags.map((tag) => tag.toLowerCase());
  const candidates = [topic, subtopic, ...questionTagsLower]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  let matches = 0;
  for (const candidate of candidates) {
    for (const tag of profileSet) {
      if (
        candidate === tag ||
        candidate.includes(tag) ||
        tag.includes(candidate)
      ) {
        matches += 1;
        break;
      }
    }
  }

  return Math.min(1, matches / Math.max(2, Math.min(6, candidates.length)));
}
