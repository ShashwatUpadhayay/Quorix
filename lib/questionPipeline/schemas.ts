import { createHash } from "node:crypto";
import { z } from "zod";
import { PIPELINE_STAGES, isPipelineStage } from "@/lib/questionPipeline/taxonomy";

export const PipelineStageSchema = z.enum(PIPELINE_STAGES);

export const QuestionStatusSchema = z.enum([
  "draft",
  "approved",
  "rejected",
  "archived",
]);

export const QuestionSourceSchema = z.enum([
  "curated",
  "seeded",
  "generated",
  "fallback",
]);

export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;
export type QuestionSource = z.infer<typeof QuestionSourceSchema>;

export const DifficultySchema = z.number().int().min(1).max(5);

/**
 * Shape requested from the LLM. Everything here must be model-generated;
 * ids, status, source and embeddings are added by the pipeline.
 */
export const GeneratedQuestionSchema = z.object({
  text: z.string().min(24).max(900),
  topic: z.string().min(2).max(80),
  subtopic: z.string().min(2).max(80),
  difficulty: DifficultySchema,
  stage: PipelineStageSchema,
  expectedPoints: z.array(z.string().min(3).max(240)).min(2).max(8),
  competencyTags: z.array(z.string().min(2).max(60)).min(1).max(10),
});

export const GeneratedQuestionListSchema = z.object({
  questions: z.array(GeneratedQuestionSchema).min(1).max(10),
});

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export const CandidateProfileSchema = z.object({
  tags: z.array(z.string()).default([]),
  experienceYears: z.number().min(0).max(50).default(0),
  primaryTopics: z.array(z.string()).default([]),
  focusAreas: z.array(z.string()).default([]),
  headline: z.string().optional(),
  level: z.string().optional(),
});

export const NextQuestionRequestSchema = z.object({
  sessionId: z.string().min(1).max(200),
  userId: z.string().optional(),
  questionNumber: z.number().int().min(1).max(50).default(1),
  plannedQuestionCount: z.number().int().min(1).max(20).default(5),
  interviewType: z
    .enum(["coding", "technical", "system_design", "behavioral"])
    .default("technical"),
  focus: z.string().max(200).default(""),
  domain: z.string().max(120).optional(),
  stage: PipelineStageSchema.optional(),
  targetDifficulty: DifficultySchema.optional(),
  mode: z.enum(["auto", "select", "generate"]).default("auto"),
  profile: CandidateProfileSchema.default({
    tags: [],
    experienceYears: 0,
    primaryTopics: [],
    focusAreas: [],
  }),
  askedQuestionIds: z.array(z.string()).default([]),
  askedQuestionTexts: z.array(z.string()).default([]),
  lastQuestion: z.string().max(1200).optional(),
  lastAnswer: z.string().max(6000).optional(),
  lastScore: z.number().min(0).max(10).optional(),
  requestId: z.string().max(120).optional(),
});

export type NextQuestionRequest = z.infer<typeof NextQuestionRequestSchema>;
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;

export const ValidationCheckSchema = z.object({
  name: z.enum([
    "schema",
    "duplicate",
    "relevance",
    "difficulty",
    "topic",
    "stage",
  ]),
  passed: z.boolean(),
  score: z.number().optional(),
  threshold: z.number().optional(),
  reason: z.string(),
});

export const ValidationResultSchema = z.object({
  accepted: z.boolean(),
  checks: z.array(ValidationCheckSchema),
  reason: z.string(),
});

export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const QuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  topic: z.string(),
  subtopic: z.string(),
  difficulty: DifficultySchema,
  stage: PipelineStageSchema,
  expectedPoints: z.array(z.string()),
  competencyTags: z.array(z.string()),
  status: QuestionStatusSchema,
  source: QuestionSourceSchema,
  embeddingModel: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  fingerprint: z.string().optional(),
  usageCount: z.number().int().min(0).default(0),
  lastUsedAt: z.date().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: z.date().optional(),
  reviewNotes: z.string().optional(),
});

export type Question = z.infer<typeof QuestionSchema>;

export const NextQuestionResponseSchema = z.object({
  question: QuestionSchema,
  source: QuestionSourceSchema,
  accepted: z.boolean(),
  reason: z.string(),
  validation: ValidationResultSchema,
  attempts: z.number().int().min(0),
  provider: z.string(),
  model: z.string(),
  latencyMs: z.number().min(0),
  cached: z.boolean(),
  fallbackUsed: z.boolean(),
});

export type NextQuestionResponse = z.infer<typeof NextQuestionResponseSchema>;

export const ReviewUpdateSchema = z
  .object({
    text: z.string().min(24).max(900).optional(),
    topic: z.string().min(2).max(80).optional(),
    subtopic: z.string().min(2).max(80).optional(),
    difficulty: DifficultySchema.optional(),
    stage: PipelineStageSchema.optional(),
    expectedPoints: z.array(z.string().min(3).max(240)).min(2).max(8).optional(),
    competencyTags: z.array(z.string().min(2).max(60)).min(1).max(10).optional(),
    reviewNotes: z.string().max(1200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be updated.",
  });

export const ReviewActionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["approve", "reject", "save", "archive"]),
  updates: ReviewUpdateSchema.optional(),
});

export type ReviewAction = z.infer<typeof ReviewActionSchema>;

/**
 * Stable content fingerprint used to deduplicate seeded/generated rows.
 */
export function fingerprintQuestion(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export function isPipelineStageValue(value: unknown): boolean {
  return isPipelineStage(value);
}
