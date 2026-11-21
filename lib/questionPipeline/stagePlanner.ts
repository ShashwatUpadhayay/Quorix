import type { PipelineStage } from "@/lib/questionPipeline/taxonomy";

const TIER_TO_DIFFICULTY: Record<string, number> = {
  Foundational: 2,
  Intermediate: 2,
  Senior: 3,
  Staff: 4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function experienceToDifficulty(experienceYears: number): number {
  if (experienceYears < 2) return 2;
  if (experienceYears < 5) return 3;
  if (experienceYears < 9) return 4;
  return 5;
}

export function baseDifficulty(params: {
  level?: string;
  experienceYears: number;
}): number {
  const levelBase =
    TIER_TO_DIFFICULTY[params.level || "Intermediate"] ||
    TIER_TO_DIFFICULTY.Intermediate;
  const expBase = experienceToDifficulty(params.experienceYears);
  return clamp(Math.round((levelBase + expBase) / 2), 1, 5);
}

/**
 * Maps a 1-based question number to a stage. Behavioural interviews skip the
 * pure technical block. For everyone else, senior candidates reach the
 * techno-managerial block earlier; junior candidates stay technical longer.
 */
export function planStage(params: {
  questionNumber: number;
  plannedQuestionCount: number;
  interviewType?: string;
  experienceYears: number;
}): PipelineStage {
  const {
    questionNumber,
    plannedQuestionCount,
    interviewType,
    experienceYears,
  } = params;

  if (questionNumber <= 1) return "icebreaker";

  if (interviewType === "behavioral") return "techno_managerial";

  const baseManagerialStart =
    plannedQuestionCount <= 2
      ? plannedQuestionCount
      : Math.max(2, plannedQuestionCount - 1);

  const shift =
    experienceYears >= 8 ? -1 : experienceYears >= 4 ? 0 : 1;

  const managerialStart = clamp(
    baseManagerialStart + shift,
    2,
    plannedQuestionCount
  );

  return questionNumber >= managerialStart
    ? "techno_managerial"
    : "technical";
}

export interface DifficultyDecision {
  difficulty: number;
  reason: string;
}

/**
 * Rule-based difficulty controller. It blends seniority, stage, progress and
 * the last answer score, then clamps to the 1-5 bank scale.
 */
export function decideTargetDifficulty(params: {
  questionNumber: number;
  plannedQuestionCount: number;
  stage: PipelineStage;
  level?: string;
  experienceYears: number;
  lastScore?: number;
}): DifficultyDecision {
  const base = baseDifficulty({
    level: params.level,
    experienceYears: params.experienceYears,
  });

  let value = base;
  const reasons: string[] = [`base ${base}`];

  if (params.stage === "icebreaker") {
    value -= 1;
    reasons.push("ice-breaker -1");
  }

  const progress = params.questionNumber / Math.max(1, params.plannedQuestionCount);
  if (progress >= 0.75 && params.stage !== "icebreaker") {
    value += 1;
    reasons.push("late-session +1");
  }

  if (typeof params.lastScore === "number") {
    if (params.lastScore >= 8.5) {
      value += 1;
      reasons.push("strong answer +1");
    } else if (params.lastScore <= 5) {
      value -= 1;
      reasons.push("weak answer -1");
    }
  }

  return {
    difficulty: clamp(value, 1, 5),
    reason: reasons.join(", "),
  };
}

/**
 * Select mode avoids an LLM call. Generation is reserved for follow-ups where
 * the candidate's answer should influence the next question.
 */
export function decideMode(params: {
  stage: PipelineStage;
  hasLastExchange: boolean;
  llmAvailable: boolean;
  requestedMode?: "auto" | "select" | "generate";
}): "select" | "generate" {
  if (params.requestedMode === "select") return "select";
  if (params.requestedMode === "generate") {
    return params.llmAvailable ? "generate" : "select";
  }
  if (params.stage === "icebreaker") return "select";
  if (!params.hasLastExchange || !params.llmAvailable) return "select";
  return "generate";
}

export function difficultyWindow(target: number): { min: number; max: number } {
  return {
    min: clamp(target - 1, 1, 5),
    max: clamp(target + 1, 1, 5),
  };
}
