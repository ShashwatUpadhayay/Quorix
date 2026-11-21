import { getDatabase, type MockSessionDoc, type MockSessionQuestion, type ProfileDoc } from "@/lib/mongodb";
import { buildEmergencyQuestion, runPipeline } from "@/lib/questionPipeline/pipeline";
import type { NextQuestionResponse } from "@/lib/questionPipeline/schemas";
import { baseDifficulty } from "@/lib/questionPipeline/stagePlanner";
import { resolveDomain } from "@/lib/questionPipeline/taxonomy";

export function toMockSessionQuestion(
  response: NextQuestionResponse,
  order: number
): MockSessionQuestion {
  const expectedPoints = response.question.expectedPoints || [];
  return {
    id: response.question.id,
    order,
    stage: response.question.stage,
    prompt: response.question.text,
    rubricHint:
      expectedPoints.length > 0
        ? `Expected points: ${expectedPoints.join("; ")}`
        : "Evaluate relevance, depth and clarity against the question.",
    expectedSignals: expectedPoints,
    topic: response.question.topic,
    subtopic: response.question.subtopic,
    difficulty: response.question.difficulty,
    expectedPoints,
    competencyTags: response.question.competencyTags,
    source: response.source,
    generationMeta: {
      provider: response.provider,
      model: response.model,
      latencyMs: response.latencyMs,
      validationReason: response.reason,
    },
  };
}

export interface NextSessionQuestionParams {
  session: MockSessionDoc;
  sessionId: string;
  userId: string;
  questionNumber: number;
  lastQuestion?: string;
  lastAnswer?: string;
  lastScore?: number;
  requestedMode?: "auto" | "select" | "generate";
}

/**
 * Bridges the Mongo session document to the provider-agnostic pipeline.
 * The candidate profile supplies tags and experience so retrieval and
 * difficulty calibration are personalized.
 */
export async function getNextSessionQuestion(
  params: NextSessionQuestionParams
): Promise<{
  response: NextQuestionResponse;
  sessionQuestion: MockSessionQuestion;
  diagnostics: Awaited<ReturnType<typeof runPipeline>>["diagnostics"];
}> {
  const db = await getDatabase();
  const profile = await db
    .collection<ProfileDoc>("profiles")
    .findOne({ userId: params.userId });

  const profileTags = Array.from(
    new Set([
      ...(profile?.skills || []).map((skill) => skill.name),
      ...(profile?.interviewConfig?.focusAreas || []),
    ])
  ).filter(Boolean);

  const request = {
    sessionId: params.sessionId,
    userId: params.userId,
    questionNumber: params.questionNumber,
    plannedQuestionCount: params.session.plannedQuestionCount || 5,
    interviewType: params.session.interviewType,
    focus: params.session.focus,
    profile: {
      tags: profileTags,
      experienceYears: profile?.interviewConfig?.experienceYears || 0,
      primaryTopics: profile?.interviewConfig?.primaryTopics || [],
      focusAreas: profile?.interviewConfig?.focusAreas || [],
      headline: profile?.headline,
      level: params.session.level,
    },
    askedQuestionIds: params.session.questions.map((question) => question.id),
    askedQuestionTexts: params.session.questions.map(
      (question) => question.prompt
    ),
    lastQuestion: params.lastQuestion,
    lastAnswer: params.lastAnswer,
    lastScore: params.lastScore,
    mode: params.requestedMode || "auto",
  } as const;

  try {
    const run = await runPipeline(request);
    return {
      response: run.response,
      sessionQuestion: toMockSessionQuestion(
        run.response,
        params.questionNumber
      ),
      diagnostics: run.diagnostics,
    };
  } catch (error) {
    console.error(
      "[QuestionPipeline] Session bridge failed; using emergency question:",
      error instanceof Error ? error.message : error
    );

    const domain = resolveDomain({
      focus: params.session.focus,
      primaryTopics: profile?.interviewConfig?.primaryTopics || [],
      profileTags,
      interviewType: params.session.interviewType,
    }).name;
    const stage =
      params.questionNumber <= 1 ? "icebreaker" : "technical";
    const targetDifficulty = baseDifficulty({
      level: params.session.level,
      experienceYears: profile?.interviewConfig?.experienceYears || 0,
    });
    const emergency = buildEmergencyQuestion({
      domain,
      stage,
      targetDifficulty,
    });
    const response: NextQuestionResponse = {
      question: emergency.question,
      source: "fallback",
      accepted: true,
      reason:
        "Pipeline unavailable; served an emergency curated question so the interview can continue.",
      validation: {
        accepted: true,
        checks: [],
        reason: "Emergency fallback bypassed normal validation.",
      },
      attempts: 0,
      provider: "fallback",
      model: "curated-bank",
      latencyMs: 0,
      cached: false,
      fallbackUsed: true,
    };

    return {
      response,
      sessionQuestion: toMockSessionQuestion(response, params.questionNumber),
      diagnostics: {
        domain,
        stage,
        targetDifficulty,
        difficultyReason: "emergency fallback",
        mode: "select",
        candidateCount: 0,
      },
    };
  }
}
