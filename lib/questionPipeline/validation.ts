import {
  cosineSimilarity,
  embedTexts,
  maxCosineSimilarity,
  tagOverlapScore,
} from "@/lib/questionPipeline/embeddings";
import {
  GeneratedQuestionSchema,
  type CandidateProfile,
  type GeneratedQuestion,
  type ValidationCheck,
  type ValidationResult,
} from "@/lib/questionPipeline/schemas";
import {
  getDomain,
  normalizeDomainName,
  type PipelineStage,
} from "@/lib/questionPipeline/taxonomy";

const DUPLICATE_THRESHOLD = Number(process.env.DUPLICATE_THRESHOLD) || 0.86;
const RELEVANCE_THRESHOLD = Number(process.env.RELEVANCE_THRESHOLD) || 0.12;
const DIFFICULTY_TOLERANCE = Number(process.env.DIFFICULTY_TOLERANCE) || 1;

export interface ValidationInput {
  question: GeneratedQuestion;
  profile: CandidateProfile;
  profileEmbedding: number[];
  questionEmbedding: number[];
  stage: PipelineStage;
  targetDifficulty: number;
  askedEmbeddings: number[][];
  /** Generated questions must satisfy every check; bank fallbacks are lenient. */
  strict: boolean;
}

export function relevanceScore(params: {
  profile: CandidateProfile;
  profileEmbedding: number[];
  questionEmbedding: number[];
  topic: string;
  subtopic: string;
  competencyTags: string[];
}): { score: number; embeddingSimilarity: number; tagScore: number } {
  const embeddingSimilarity = cosineSimilarity(
    params.profileEmbedding,
    params.questionEmbedding
  );
  const tagScore = tagOverlapScore(
    params.competencyTags,
    params.profile.tags,
    params.topic,
    params.subtopic
  );

  return {
    score: Math.min(
      1,
      Math.max(tagScore * 0.9, embeddingSimilarity * 1.8)
    ),
    embeddingSimilarity,
    tagScore,
  };
}

export function validateQuestion(input: ValidationInput): ValidationResult {
  const checks: ValidationCheck[] = [];
  const { question } = input;

  const schema = GeneratedQuestionSchema.safeParse(question);
  checks.push({
    name: "schema",
    passed: schema.success,
    reason: schema.success
      ? "Question matches the generated-question schema."
      : `Schema errors: ${schema.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
  });

  const domain = getDomain(question.topic);
  checks.push({
    name: "topic",
    passed: Boolean(domain),
    reason: domain
      ? `Topic resolves to "${domain.name}".`
      : `Unknown topic "${question.topic}".`,
  });

  checks.push({
    name: "stage",
    passed: question.stage === input.stage,
    reason:
      question.stage === input.stage
        ? `Stage matches requested "${input.stage}".`
        : `Expected stage "${input.stage}" but received "${question.stage}".`,
  });

  const duplicateSimilarity = maxCosineSimilarity(
    input.questionEmbedding,
    input.askedEmbeddings
  );
  checks.push({
    name: "duplicate",
    passed: duplicateSimilarity < DUPLICATE_THRESHOLD,
    score: Number(duplicateSimilarity.toFixed(3)),
    threshold: DUPLICATE_THRESHOLD,
    reason:
      duplicateSimilarity < DUPLICATE_THRESHOLD
        ? "Not a near-duplicate of a question already asked in this session."
        : `Near-duplicate of an asked question (similarity ${duplicateSimilarity.toFixed(
            3
          )} >= ${DUPLICATE_THRESHOLD}).`,
  });

  const relevance = relevanceScore({
    profile: input.profile,
    profileEmbedding: input.profileEmbedding,
    questionEmbedding: input.questionEmbedding,
    topic: question.topic,
    subtopic: question.subtopic,
    competencyTags: question.competencyTags,
  });
  checks.push({
    name: "relevance",
    passed: relevance.score >= RELEVANCE_THRESHOLD,
    score: Number(relevance.score.toFixed(3)),
    threshold: RELEVANCE_THRESHOLD,
    reason:
      relevance.score >= RELEVANCE_THRESHOLD
        ? `Relevant to candidate profile (score ${relevance.score.toFixed(3)}).`
        : `Weak relevance to candidate profile (score ${relevance.score.toFixed(
            3
          )} < ${RELEVANCE_THRESHOLD}).`,
  });

  const difficultyDistance = Math.abs(
    question.difficulty - input.targetDifficulty
  );
  checks.push({
    name: "difficulty",
    passed: difficultyDistance <= DIFFICULTY_TOLERANCE,
    score: difficultyDistance,
    threshold: DIFFICULTY_TOLERANCE,
    reason:
      difficultyDistance <= DIFFICULTY_TOLERANCE
        ? `Difficulty ${question.difficulty} is within ±${DIFFICULTY_TOLERANCE} of target ${input.targetDifficulty}.`
        : `Difficulty ${question.difficulty} is ${difficultyDistance} away from target ${input.targetDifficulty}.`,
  });

  const schemaPassed = checks.find((check) => check.name === "schema")?.passed;
  const topicPassed = checks.find((check) => check.name === "topic")?.passed;
  const duplicatePassed = checks.find(
    (check) => check.name === "duplicate"
  )?.passed;
  const relevancePassed = checks.find(
    (check) => check.name === "relevance"
  )?.passed;
  const difficultyPassed = checks.find(
    (check) => check.name === "difficulty"
  )?.passed;
  const stagePassed = checks.find((check) => check.name === "stage")?.passed;

  const accepted = input.strict
    ? Boolean(
        schemaPassed &&
          topicPassed &&
          duplicatePassed &&
          relevancePassed &&
          difficultyPassed &&
          stagePassed
      )
    : Boolean(schemaPassed && topicPassed && duplicatePassed);

  const failed = checks.filter((check) => !check.passed);
  const reason = accepted
    ? "All validation checks passed."
    : failed.length > 0
      ? failed.map((check) => check.reason).join(" ")
      : "Validation failed.";

  return { accepted, checks, reason };
}

export async function embedAskedQuestions(
  askedTexts: string[]
): Promise<number[][]> {
  if (askedTexts.length === 0) return [];
  return embedTexts(askedTexts);
}

export function normalizeGeneratedTopic(
  question: GeneratedQuestion
): GeneratedQuestion {
  return {
    ...question,
    topic: normalizeDomainName(question.topic),
    competencyTags: Array.from(
      new Set(question.competencyTags.map((tag) => tag.trim()).filter(Boolean))
    ).slice(0, 10),
    expectedPoints: question.expectedPoints
      .map((point) => point.trim())
      .filter(Boolean)
      .slice(0, 8),
  };
}

export const VALIDATION_THRESHOLDS = {
  duplicate: DUPLICATE_THRESHOLD,
  relevance: RELEVANCE_THRESHOLD,
  difficultyTolerance: DIFFICULTY_TOLERANCE,
};
