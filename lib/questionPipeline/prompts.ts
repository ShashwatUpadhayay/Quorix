import type { CandidateProfile, GeneratedQuestion } from "@/lib/questionPipeline/schemas";
import type { PipelineStage } from "@/lib/questionPipeline/taxonomy";
import { STAGE_LABELS } from "@/lib/questionPipeline/taxonomy";

const DIFFICULTY_RUBRIC = `
Difficulty scale (1-5):
1 = recall and definitions; a strong junior can answer in under a minute.
2 = applied fundamentals; one concrete example plus a basic trade-off.
3 = production engineering; debugging, trade-offs, failure modes and metrics.
4 = architecture under constraints; multi-service design, scaling, migration risk.
5 = ambiguous, org-wide or novel problems; the candidate must frame the problem and defend a strategy.
`.trim();

const QUESTION_STYLE_RULES = `
Question style rules:
- Write one self-contained question in 1-3 sentences. No bullet lists and no multi-part "and also" prompts.
- Ground the question in a realistic engineering situation. Avoid trivia and textbook definitions.
- Make the expected points concrete enough that another interviewer could grade the answer.
- Do not include the answer in the question text.
- Do not mention that this is an AI-generated interview.
- Never reuse the wording of the style examples. Match topic and difficulty, not phrasing.
- Keep the question answerable in 2-4 minutes of spoken response.
`.trim();

export function buildSystemPrompt(): string {
  return `You are a senior technical interviewer building a calibrated question bank for software engineering interviews.

Return only JSON that matches the requested schema. Do not wrap the JSON in prose or markdown.
${DIFFICULTY_RUBRIC}
${QUESTION_STYLE_RULES}`;
}

export interface SeedPromptContext {
  domain: string;
  domainDescription: string;
  subtopic: string;
  stage: PipelineStage;
  difficulty: number;
  count: number;
  variation: string;
  existingQuestions?: string[];
}

export function buildSeedPrompt(context: SeedPromptContext): string {
  const existing =
    context.existingQuestions && context.existingQuestions.length > 0
      ? `\nAlready covered in this batch (do not duplicate):\n${context.existingQuestions
          .slice(-10)
          .map((question) => `- ${question}`)
          .join("\n")}`
      : "";

  return `Generate ${context.count} distinct interview questions.

Domain: ${context.domain}
Domain description: ${context.domainDescription}
Subtopic: ${context.subtopic}
Stage: ${STAGE_LABELS[context.stage]} (${context.stage})
Target difficulty: ${context.difficulty}/5
Angle for this batch: ${context.variation}

Requirements:
- Use "${context.domain}" as topic and "${context.subtopic}" as subtopic for every question.
- Set stage to "${context.stage}" and difficulty to ${context.difficulty}.
- Provide 3-5 expectedPoints per question. Each point should name a specific concept, trade-off, failure mode, metric, or concrete example a strong answer would include.
- Provide 3-6 competencyTags per question. Prefer concrete technologies and concepts (e.g. "Kafka", "idempotency", "cache invalidation") over generic labels.
- Vary the scenario across the ${context.count} questions: incident, design, debugging, migration, comparison, operational trade-off.
${existing}

Return exactly this shape:
{"questions":[{"text":"...","topic":"...","subtopic":"...","difficulty":${context.difficulty},"stage":"${context.stage}","expectedPoints":["..."],"competencyTags":["..."]}]}`;
}

export interface FollowUpPromptContext {
  profile: CandidateProfile;
  domain: string;
  domainDescription: string;
  subtopic: string;
  stage: PipelineStage;
  targetDifficulty: number;
  questionNumber: number;
  plannedQuestionCount: number;
  lastQuestion?: string;
  lastAnswer?: string;
  lastScore?: number;
  styleExamples: Array<Pick<GeneratedQuestion, "text" | "difficulty" | "stage">>;
  askedQuestions: string[];
}

export function buildFollowUpPrompt(context: FollowUpPromptContext): string {
  const profileTags = context.profile.tags.slice(0, 18).join(", ") || "not provided";
  const primaryTopics =
    context.profile.primaryTopics.slice(0, 6).join(", ") || context.domain;
  const styleExamples =
    context.styleExamples.length > 0
      ? context.styleExamples
          .map(
            (example, index) =>
              `${index + 1}. [${example.stage} · difficulty ${example.difficulty}] ${example.text}`
          )
          .join("\n")
      : "No examples available. Follow the style rules directly.";

  const asked =
    context.askedQuestions.length > 0
      ? context.askedQuestions
          .slice(-10)
          .map((question) => `- ${question}`)
          .join("\n")
      : "- None yet";

  const lastExchange =
    context.lastQuestion || context.lastAnswer
      ? `Last question: ${context.lastQuestion || "(not provided)"}
Candidate answer: ${(context.lastAnswer || "(not provided)").slice(0, 1800)}
Last answer score: ${context.lastScore ?? "not scored"}/10`
      : "This is the first technical question; no previous exchange.";

  return `Write the next question for an in-progress mock interview.

Candidate profile:
- Level: ${context.profile.level || "unspecified"}
- Experience: ${context.profile.experienceYears} years
- Headline: ${context.profile.headline || "not provided"}
- Resume / competency tags: ${profileTags}
- Primary topics: ${primaryTopics}

Interview position:
- Question ${context.questionNumber} of ${context.plannedQuestionCount}
- Stage: ${STAGE_LABELS[context.stage]} (${context.stage})
- Target difficulty: ${context.targetDifficulty}/5
- Domain: ${context.domain} — ${context.domainDescription}
- Preferred subtopic: ${context.subtopic}

Previous exchange:
${lastExchange}

Already asked in this session (must not duplicate or paraphrase):
${asked}

Retrieved style examples (match topic, difficulty and style; do NOT copy wording):
${styleExamples}

Requirements:
- Return one question in the requested JSON schema.
- Set topic to "${context.domain}" and subtopic to "${context.subtopic}" unless the candidate's answer clearly points to a better subtopic within the same domain.
- Set difficulty to ${context.targetDifficulty} and stage to "${context.stage}".
- If the candidate's answer was strong, probe one level deeper; if it was shallow, test the missing prerequisite.
- Provide 3-5 specific expectedPoints and 3-6 competencyTags.
- Do not repeat any question from the "already asked" list.

Return exactly one JSON object matching the schema.`;
}

export function buildVariation(index: number): string {
  const variations = [
    "a realistic production incident and how the candidate would diagnose it",
    "a design decision with explicit trade-offs and constraints",
    "a debugging or performance investigation with metrics",
    "a migration or rollout with backward compatibility risk",
    "a comparison between two viable approaches",
    "an operational failure mode and how to prevent recurrence",
  ];
  return variations[index % variations.length];
}
