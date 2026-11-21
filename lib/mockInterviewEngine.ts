import type {
  DifficultyTier,
  InterviewType,
  MockSessionQuestion,
  MockSessionResponse,
} from "@/lib/mongodb";

export function getQuestionCountForDuration(durationMinutes: number): number {
  if (durationMinutes <= 15) return 2;
  if (durationMinutes <= 30) return 3;
  if (durationMinutes <= 45) return 4;
  return 5;
}

interface EvaluateParams {
  question: MockSessionQuestion;
  userAnswer: string;
  codeSubmitted?: string;
  interviewType: InterviewType;
  level: DifficultyTier;
  focus: string;
}

export function evaluateMockResponse({
  question,
  userAnswer,
  codeSubmitted,
  interviewType,
  level,
  focus,
}: EvaluateParams) {
  const combinedText = `${userAnswer} ${codeSubmitted || ""}`.trim();
  const lower = combinedText.toLowerCase();
  const wordCount = combinedText.split(/\s+/).filter(Boolean).length;

  const technicalKeywords = [
    "latency", "throughput", "concurrency", "memory", "cache", "index",
    "complexity", "o(1)", "o(n)", "o(log n)", "async", "promise",
    "goroutine", "thread", "lock", "mutex", "idempotent", "retry",
    "circuit breaker", "failure", "edge case", "test", "profiler",
    "benchmark", "trade-off", "tradeoff", "scale", "partition",
    "replica", "consistency", "schema",
  ];
  const matchedKeywords = technicalKeywords.filter((keyword) =>
    lower.includes(keyword)
  );
  const lengthSignal = Math.min(2.4, wordCount / 28);
  const keywordSignal = Math.min(2.2, matchedKeywords.length * 0.35);
  const hasCode = Boolean(codeSubmitted && codeSubmitted.trim().length > 25);
  const codeBonus = interviewType === "coding" && hasCode ? 0.8 : 0;
  const tierBonus =
    level === "Staff" ? 0.3 : level === "Senior" ? 0.4 : 0.6;

  const relevance = Math.min(
    9.8,
    Math.round((6.8 + lengthSignal * 0.6 + keywordSignal * 0.7 + codeBonus) * 10) /
      10
  );
  const depth = Math.min(
    9.7,
    Math.round(
      (6.2 +
        keywordSignal * 1.1 +
        (hasCode ? 0.7 : 0) +
        (lower.includes("trade-off") || lower.includes("tradeoff") ? 0.5 : 0)) *
        10
    ) / 10
  );
  const clarity = Math.min(
    9.8,
    Math.round(
      (7.0 + lengthSignal * 0.65 + (combinedText.includes("\n") ? 0.3 : 0) +
        tierBonus) *
        10
    ) / 10
  );
  const overall = Math.round(((relevance + depth + clarity) / 3) * 10) / 10;

  const feedbackItems: string[] = [];
  if (interviewType === "coding") {
    feedbackItems.push(
      hasCode
        ? `Code structure provided for ${focus} aligns with the prompt.`
        : "Providing an executable code snippet would better demonstrate hands-on fluency."
    );
  }
  if (matchedKeywords.length >= 3) {
    feedbackItems.push(
      `Strong technical terminology demonstrated (${matchedKeywords
        .slice(0, 3)
        .join(", ") }).`
    );
  } else {
    feedbackItems.push(
      `Strengthen the response with concrete trade-offs, metrics, failure modes and time/space complexity for a ${level} answer.`
    );
  }
  feedbackItems.push(`Rubric focus: ${question.rubricHint}`);

  return {
    scores: { relevance, depth, clarity, overall },
    feedback: feedbackItems.join(" "),
  };
}

export function generateSessionSummary(
  responses: MockSessionResponse[],
  interviewType: InterviewType,
  focus: string,
  level: DifficultyTier
) {
  if (responses.length === 0) {
    return {
      overallScore: 0,
      categoryScores: { relevance: 0, depth: 0, clarity: 0 },
      summaryFeedback: "Session ended with no responses submitted.",
    };
  }

  const n = responses.length;
  const relevance =
    Math.round(
      (responses.reduce((sum, response) => sum + response.scores.relevance, 0) /
        n) *
        10
    ) / 10;
  const depth =
    Math.round(
      (responses.reduce((sum, response) => sum + response.scores.depth, 0) /
        n) *
        10
    ) / 10;
  const clarity =
    Math.round(
      (responses.reduce((sum, response) => sum + response.scores.clarity, 0) /
        n) *
        10
    ) / 10;
  const overallScore =
    Math.round(
      (responses.reduce((sum, response) => sum + response.scores.overall, 0) /
        n) *
        10
    ) / 10;

  const typeLabels: Record<InterviewType, string> = {
    coding: "Coding & Algorithmic",
    technical: "Technical Architecture & Systems",
    system_design: "System Design & Distributed Scalability",
    behavioral: "Techno-Behavioral & Leadership",
  };
  const summaryFeedback =
    overallScore >= 8.5
      ? `Exceptional ${typeLabels[interviewType]} performance in ${focus}, with depth and systematic trade-off analysis suitable for ${level} standards.`
      : overallScore >= 7
        ? `Strong ${typeLabels[interviewType]} performance in ${focus}. Add more production metrics and failure scenarios to raise the ceiling.`
        : `Foundational competency demonstrated in ${focus}. Focus on structured reasoning, trade-offs and production failure scenarios.`;

  return {
    overallScore,
    categoryScores: { relevance, depth, clarity },
    summaryFeedback,
  };
}
