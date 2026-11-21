import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/mongodb";
import {
  buildCacheKey,
  getCached,
  hashValue,
  setCached,
} from "@/lib/questionPipeline/cache";
import {
  getQuestionById,
  insertQuestion,
  markQuestionsUsed,
  retrieveCandidates,
  type BankQuestion,
  type RankedQuestion,
} from "@/lib/questionPipeline/bank";
import { CURATED_QUESTIONS } from "@/lib/questionPipeline/curatedBank";
import {
  buildProfileEmbeddingText,
  embedText,
  embedTexts,
  getEmbeddingModelId,
  localEmbedding,
} from "@/lib/questionPipeline/embeddings";
import {
  checkOllamaReachable,
  getConfiguredProvider,
  getLlmClient,
  getLlmClientInfo,
} from "@/lib/questionPipeline/llm";
import {
  buildFollowUpPrompt,
  buildSystemPrompt,
} from "@/lib/questionPipeline/prompts";
import {
  GeneratedQuestionSchema,
  NextQuestionRequestSchema,
  type CandidateProfile,
  type GeneratedQuestion,
  type NextQuestionRequest,
  type NextQuestionResponse,
  type Question,
  type ValidationResult,
} from "@/lib/questionPipeline/schemas";
import {
  baseDifficulty,
  decideMode,
  decideTargetDifficulty,
  planStage,
} from "@/lib/questionPipeline/stagePlanner";
import {
  getDomain,
  getSubtopic,
  normalizeDomainName,
  normalizeSubtopicName,
  resolveDomain,
  type PipelineStage,
} from "@/lib/questionPipeline/taxonomy";
import {
  embedAskedQuestions,
  normalizeGeneratedTopic,
  validateQuestion,
} from "@/lib/questionPipeline/validation";

export class PipelineError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, options: { code?: string; status?: number } = {}) {
    super(message);
    this.name = "PipelineError";
    this.code = options.code || "pipeline_error";
    this.status = options.status || 500;
  }
}

interface LlmAvailabilityGlobal {
  _quorixOllamaAvailability?: { checkedAt: number; reachable: boolean };
}

const globalForAvailability = global as unknown as LlmAvailabilityGlobal;
const OLLAMA_CHECK_TTL_MS = 30_000;

async function isLlmAvailable(): Promise<boolean> {
  const provider = getConfiguredProvider();
  if (provider === "gemini") {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  const cached = globalForAvailability._quorixOllamaAvailability;
  if (cached && Date.now() - cached.checkedAt < OLLAMA_CHECK_TTL_MS) {
    return cached.reachable;
  }

  const reachable = await checkOllamaReachable();
  globalForAvailability._quorixOllamaAvailability = {
    checkedAt: Date.now(),
    reachable,
  };
  return reachable;
}

function toGeneratedQuestion(question: BankQuestion): GeneratedQuestion {
  return {
    text: question.text,
    topic: question.topic,
    subtopic: question.subtopic,
    difficulty: question.difficulty,
    stage: question.stage,
    expectedPoints: question.expectedPoints,
    competencyTags: question.competencyTags,
  };
}

function toResponseQuestion(params: {
  id: string;
  question: GeneratedQuestion;
  status: Question["status"];
  source: Question["source"];
  provider?: string;
  model?: string;
  embeddingModel?: string;
  usageCount?: number;
}): Question {
  return {
    id: params.id,
    text: params.question.text,
    topic: params.question.topic,
    subtopic: params.question.subtopic,
    difficulty: params.question.difficulty,
    stage: params.question.stage,
    expectedPoints: params.question.expectedPoints,
    competencyTags: params.question.competencyTags,
    status: params.status,
    source: params.source,
    provider: params.provider,
    model: params.model,
    embeddingModel: params.embeddingModel,
    usageCount: params.usageCount || 0,
  };
}

function weightedPick<T extends { score: number }>(items: T[], topN = 8): T {
  const top = items.slice(0, Math.max(1, topN));
  if (top.length === 1) return top[0];

  const floor = top[top.length - 1].score;
  const weights = top.map((item) => Math.max(0.04, item.score - floor + 0.04));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let threshold = Math.random() * total;

  for (let index = 0; index < top.length; index += 1) {
    threshold -= weights[index];
    if (threshold <= 0) return top[index];
  }

  return top[0];
}

function enrichProfile(
  request: NextQuestionRequest,
  domain: string
): CandidateProfile {
  const tags = Array.from(
    new Set(
      [
        ...request.profile.tags,
        ...request.profile.primaryTopics,
        ...request.profile.focusAreas,
        request.focus,
        domain,
      ]
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).slice(0, 30);

  return {
    ...request.profile,
    tags,
    primaryTopics:
      request.profile.primaryTopics.length > 0
        ? request.profile.primaryTopics
        : [domain],
  };
}

export function buildEmergencyQuestion(params: {
  domain: string;
  stage: PipelineStage;
  targetDifficulty: number;
}): { question: Question; generated: GeneratedQuestion } {
  const domainPool = CURATED_QUESTIONS.filter(
    (question) =>
      question.topic === params.domain && question.stage === params.stage
  );
  const stagePool =
    domainPool.length > 0
      ? domainPool
      : CURATED_QUESTIONS.filter((question) => question.stage === params.stage);
  const pool = stagePool.length > 0 ? stagePool : CURATED_QUESTIONS;

  const sorted = [...pool].sort(
    (a, b) =>
      Math.abs(a.difficulty - params.targetDifficulty) -
      Math.abs(b.difficulty - params.targetDifficulty)
  );
  const shortlist = sorted.slice(0, Math.min(3, sorted.length));
  const chosen = shortlist[Math.floor(Math.random() * shortlist.length)] || pool[0];

  const generated: GeneratedQuestion = {
    text: chosen.text,
    topic: chosen.topic,
    subtopic: chosen.subtopic,
    difficulty: chosen.difficulty,
    stage: chosen.stage,
    expectedPoints: chosen.expectedPoints,
    competencyTags: chosen.competencyTags,
  };

  return {
    generated,
    question: toResponseQuestion({
      id: `emergency-${hashValue(chosen.text).slice(0, 12)}`,
      question: generated,
      status: "approved",
      source: "fallback",
    }),
  };
}

interface GenerationLogDoc {
  sessionId: string;
  userId?: string;
  requestId?: string;
  questionNumber: number;
  stage: PipelineStage;
  targetDifficulty: number;
  mode: "select" | "generate";
  source: string;
  accepted: boolean;
  reason: string;
  checks: ValidationResult["checks"];
  attempts: number;
  provider: string;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  cached: boolean;
  questionId?: string;
  questionText?: string;
  createdAt: Date;
}

async function logGeneration(doc: GenerationLogDoc): Promise<void> {
  try {
    const db = await getDatabase();
    await db
      .collection<GenerationLogDoc>("question_generation_logs")
      .insertOne(doc);
  } catch (error) {
    console.warn(
      "[QuestionPipeline] Could not write generation log:",
      error instanceof Error ? error.message : error
    );
  }
}

function cacheTtlMs(): number {
  return Number(process.env.PIPELINE_CACHE_TTL_MS) || 300_000;
}

function pipelineBudgetMs(): number {
  return Number(process.env.PIPELINE_MAX_MS) || 30_000;
}

export interface PipelineRunResult {
  response: NextQuestionResponse;
  diagnostics: {
    domain: string;
    stage: PipelineStage;
    targetDifficulty: number;
    difficultyReason: string;
    mode: "select" | "generate";
    candidateCount: number;
  };
}

export async function getNextQuestion(
  rawRequest: unknown
): Promise<NextQuestionResponse> {
  const run = await runPipeline(rawRequest);
  return run.response;
}

export async function runPipeline(rawRequest: unknown): Promise<PipelineRunResult> {
  const parsed = NextQuestionRequestSchema.safeParse(rawRequest);
  if (!parsed.success) {
    throw new PipelineError(
      `Invalid next-question request: ${parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
      { code: "invalid_request", status: 400 }
    );
  }

  const request = parsed.data;
  const startedAt = Date.now();
  const budget = pipelineBudgetMs();
  const remaining = () => Math.max(400, budget - (Date.now() - startedAt));

  const domain = request.domain
    ? normalizeDomainName(request.domain)
    : resolveDomain({
        focus: request.focus,
        primaryTopics: request.profile.primaryTopics,
        profileTags: request.profile.tags,
        interviewType: request.interviewType,
      }).name;

  const profile = enrichProfile(request, domain);
  const stage =
    request.stage ||
    planStage({
      questionNumber: request.questionNumber,
      plannedQuestionCount: request.plannedQuestionCount,
      interviewType: request.interviewType,
      experienceYears: profile.experienceYears,
    });

  const difficultyDecision = request.targetDifficulty
    ? {
        difficulty: request.targetDifficulty,
        reason: "caller override",
      }
    : decideTargetDifficulty({
        questionNumber: request.questionNumber,
        plannedQuestionCount: request.plannedQuestionCount,
        stage,
        level: profile.level,
        experienceYears: profile.experienceYears,
        lastScore: request.lastScore,
      });

  const targetDifficulty = difficultyDecision.difficulty;
  const llmInfo = getLlmClientInfo();
  const embeddingModel = getEmbeddingModelId();

  const cacheKey = buildCacheKey({
    v: "v1",
    domain,
    stage,
    targetDifficulty,
    mode: request.mode,
    tags: profile.tags,
    lastAnswer: request.lastAnswer ? hashValue(request.lastAnswer) : "",
    asked: request.askedQuestionIds,
    questionNumber: request.questionNumber,
    planned: request.plannedQuestionCount,
  });

  const cached = getCached<NextQuestionResponse>(cacheKey);
  if (
    cached &&
    !request.askedQuestionIds.includes(cached.question.id) &&
    cached.question.stage === stage
  ) {
    return {
      response: { ...cached, cached: true },
      diagnostics: {
        domain,
        stage,
        targetDifficulty,
        difficultyReason: difficultyDecision.reason,
        mode: cached.source === "generated" ? "generate" : "select",
        candidateCount: 0,
      },
    };
  }

  const [profileEmbedding, askedEmbeddings] = await Promise.all([
    embedText(buildProfileEmbeddingText(profile)),
    embedAskedQuestions(request.askedQuestionTexts),
  ]);

  let candidates: RankedQuestion[] = [];
  try {
    candidates = await retrieveCandidates({
      profile,
      profileEmbedding,
      domain,
      stage,
      targetDifficulty,
      excludeIds: request.askedQuestionIds,
      limit: 24,
    });
  } catch (error) {
    console.warn(
      "[QuestionPipeline] Retrieval failed; using emergency fallback:",
      error instanceof Error ? error.message : error
    );
  }

  const hasLastExchange = Boolean(
    request.lastQuestion && request.lastAnswer?.trim()
  );
  const llmAvailable = await isLlmAvailable();
  const mode = decideMode({
    stage,
    hasLastExchange,
    llmAvailable,
    requestedMode: request.mode,
  });

  let fallbackUsed = false;
  let generationFailureReason = "";
  let attempts = 0;
  let response: NextQuestionResponse | null = null;

  if (mode === "generate" && candidates.length > 0 && remaining() > 1_500) {
    const styleExamples = candidates.slice(0, 5).map((candidate) => ({
      text: candidate.question.text,
      difficulty: candidate.question.difficulty,
      stage: candidate.question.stage,
    }));
    const preferredSubtopic =
      candidates[0]?.question.subtopic ||
      getDomain(domain)?.subtopics[0]?.name ||
      domain;
    const domainDescription =
      getDomain(domain)?.description || "Software engineering";

    let prompt = buildFollowUpPrompt({
      profile,
      domain,
      domainDescription,
      subtopic: preferredSubtopic,
      stage,
      targetDifficulty,
      questionNumber: request.questionNumber,
      plannedQuestionCount: request.plannedQuestionCount,
      lastQuestion: request.lastQuestion,
      lastAnswer: request.lastAnswer,
      lastScore: request.lastScore,
      styleExamples,
      askedQuestions: request.askedQuestionTexts,
    });

    const llm = getLlmClient();
    const maxAttempts = 2;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (remaining() < 1_200) {
        generationFailureReason = "Pipeline time budget exhausted before generation.";
        break;
      }

      attempts += 1;
      try {
        const completion = await llm.completeJson({
          schema: GeneratedQuestionSchema,
          system: buildSystemPrompt(),
          prompt,
          temperature: attempt === 0 ? 0.75 : 0.55,
          timeoutMs: Math.min(remaining(), 20_000),
          label: `question.generate.${request.questionNumber}`,
        });

        const normalized = normalizeGeneratedTopic(completion.data);
        const resolvedTopic = getDomain(normalized.topic)?.name || domain;
        const resolvedSubtopic =
          getSubtopic(resolvedTopic, normalized.subtopic)?.name ||
          normalizeSubtopicName(resolvedTopic, preferredSubtopic);

        const candidate: GeneratedQuestion = {
          ...normalized,
          topic: resolvedTopic,
          subtopic: resolvedSubtopic,
        };

        const questionEmbedding = await embedText(candidate.text);
        const validation = validateQuestion({
          question: candidate,
          profile,
          profileEmbedding,
          questionEmbedding,
          stage,
          targetDifficulty,
          askedEmbeddings,
          strict: true,
        });

        if (validation.accepted) {
          const insert = await insertQuestion({
            question: candidate,
            source: "generated",
            status: "draft",
            provider: llm.provider,
            model: llm.model,
            embedding: questionEmbedding,
            embeddingModel,
            reviewNotes: `Generated for session ${request.sessionId}`,
          });

          const question = toResponseQuestion({
            id: insert.id || randomUUID(),
            question: candidate,
            status: "draft",
            source: "generated",
            provider: llm.provider,
            model: llm.model,
            embeddingModel,
          });

          response = {
            question,
            source: "generated",
            accepted: true,
            reason: validation.reason,
            validation,
            attempts,
            provider: llm.provider,
            model: llm.model,
            latencyMs: Date.now() - startedAt,
            cached: false,
            fallbackUsed,
          };
          break;
        }

        generationFailureReason = validation.reason;
        prompt = `${prompt}

The previous attempt was rejected by validation:
${validation.reason}
Write a different question that fixes this. Do not paraphrase the rejected question.`;
      } catch (error) {
        generationFailureReason =
          error instanceof Error ? error.message : "Unknown LLM error.";
        console.warn(
          `[QuestionPipeline] Generation attempt ${attempt + 1} failed:`,
          generationFailureReason
        );
      }
    }

    if (!response) {
      fallbackUsed = true;
    }
  } else if (mode === "generate") {
    generationFailureReason =
      candidates.length === 0
        ? "No retrieval candidates available for generation."
        : "Not enough time budget left for generation.";
    fallbackUsed = true;
  }

  if (!response) {
    if (candidates.length === 0) {
      const emergency = buildEmergencyQuestion({
        domain,
        stage,
        targetDifficulty,
      });
      const validation = validateQuestion({
        question: emergency.generated,
        profile,
        profileEmbedding,
        questionEmbedding: localEmbedding(emergency.generated.text),
        stage,
        targetDifficulty,
        askedEmbeddings,
        strict: false,
      });
      response = {
        question: emergency.question,
        source: "fallback",
        accepted: true,
        reason:
          generationFailureReason ||
          "No bank candidates or LLM output were available; served an emergency curated question.",
        validation,
        attempts,
        provider: llmInfo.provider,
        model: llmInfo.model,
        latencyMs: Date.now() - startedAt,
        cached: false,
        fallbackUsed: true,
      };
    } else {
      const eligible: Array<{
        candidate: RankedQuestion;
        validation: ValidationResult;
      }> = [];

      for (const candidate of candidates.slice(0, 12)) {
        const validation = validateQuestion({
          question: toGeneratedQuestion(candidate.question),
          profile,
          profileEmbedding,
          questionEmbedding: candidate.question.embedding,
          stage,
          targetDifficulty,
          askedEmbeddings,
          strict: false,
        });
        if (validation.accepted) {
          eligible.push({ candidate, validation });
        }
      }

      const chosen =
        eligible.length > 0
          ? weightedPick(
              eligible.map((item) => ({
                ...item,
                score: item.candidate.score,
              })),
              8
            )
          : {
              candidate: candidates[0],
              validation: validateQuestion({
                question: toGeneratedQuestion(candidates[0].question),
                profile,
                profileEmbedding,
                questionEmbedding: candidates[0].question.embedding,
                stage,
                targetDifficulty,
                askedEmbeddings,
                strict: false,
              }),
            };

      const selected = chosen.candidate.question;
      const question = toResponseQuestion({
        id: selected.id,
        question: toGeneratedQuestion(selected),
        status: selected.status,
        source: selected.source,
        provider: selected.provider,
        model: selected.model,
        embeddingModel: selected.embeddingModel,
        usageCount: selected.usageCount,
      });

      response = {
        question,
        source: fallbackUsed ? "fallback" : selected.source,
        accepted: true,
        reason:
          generationFailureReason ||
          chosen.validation.reason ||
          "Selected the best-ranked approved bank question.",
        validation: chosen.validation,
        attempts,
        provider: llmInfo.provider,
        model: llmInfo.model,
        latencyMs: Date.now() - startedAt,
        cached: false,
        fallbackUsed,
      };

      void markQuestionsUsed([selected.id]).catch(() => {});
    }
  }

  setCached(cacheKey, response, cacheTtlMs());

  await logGeneration({
    sessionId: request.sessionId,
    userId: request.userId,
    requestId: request.requestId,
    questionNumber: request.questionNumber,
    stage,
    targetDifficulty,
    mode,
    source: response.source,
    accepted: response.accepted,
    reason: response.reason,
    checks: response.validation.checks,
    attempts: response.attempts,
    provider: response.provider,
    model: response.model,
    latencyMs: response.latencyMs,
    fallbackUsed: response.fallbackUsed,
    cached: response.cached,
    questionId: response.question.id,
    questionText: response.question.text,
    createdAt: new Date(),
  });

  return {
    response,
    diagnostics: {
      domain,
      stage,
      targetDifficulty,
      difficultyReason: difficultyDecision.reason,
      mode,
      candidateCount: candidates.length,
    },
  };
}

export async function getPipelineDiagnostics(): Promise<{
  provider: string;
  model: string;
  llmAvailable: boolean;
  embeddingModel: string;
  baseDifficulty: number;
}> {
  const info = getLlmClientInfo();
  return {
    provider: info.provider,
    model: info.model,
    llmAvailable: await isLlmAvailable(),
    embeddingModel: getEmbeddingModelId(),
    baseDifficulty: baseDifficulty({ experienceYears: 3 }),
  };
}

export async function getQuestionForDebug(id: string) {
  return getQuestionById(id);
}
