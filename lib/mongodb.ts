import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/quorix";
const dbName = process.env.MONGODB_DB || "quorix";

interface GlobalWithMongo {
  _mongoClientPromise?: Promise<MongoClient>;
  _mongoClientUri?: string;
}

const globalWithMongo = global as unknown as GlobalWithMongo;

let clientPromise: Promise<MongoClient>;

if (!process.env.MONGODB_URI) {
  // Fallback warning in development
  console.warn(
    "[Quorix DB] MONGODB_URI is not explicitly defined in environment variables. Falling back to mongodb://localhost:27017/quorix"
  );
}

if (process.env.NODE_ENV === "development") {
  // In development, preserve client across hot-reloads
  if (
    !globalWithMongo._mongoClientPromise ||
    globalWithMongo._mongoClientUri !== uri
  ) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    const connectionPromise = client.connect();
    const retryableConnectionPromise = connectionPromise.catch((error) => {
      if (globalWithMongo._mongoClientPromise === retryableConnectionPromise) {
        delete globalWithMongo._mongoClientPromise;
        delete globalWithMongo._mongoClientUri;
      }
      throw error;
    });

    globalWithMongo._mongoClientPromise = retryableConnectionPromise;
    globalWithMongo._mongoClientUri = uri;
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production, instantiate client per process
  const client = new MongoClient(uri, {
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 5000,
  });
  clientPromise = client.connect();
}

/**
 * Returns the cached MongoDB client instance.
 */
export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise;
}

/**
 * Returns the application database instance.
 */
export async function getDatabase(customDbName?: string): Promise<Db> {
  const client = await getMongoClient();
  return client.db(customDbName || dbName);
}

/**
 * Closes the cached client so offline scripts can exit cleanly.
 * Intended for CLI jobs, not for long-lived server processes.
 */
export async function closeMongoClient(): Promise<void> {
  try {
    const client = await clientPromise;
    await client.close();
  } catch {
    // Nothing to close, or the connection already failed.
  } finally {
    if (process.env.NODE_ENV === "development") {
      delete globalWithMongo._mongoClientPromise;
      delete globalWithMongo._mongoClientUri;
    }
  }
}

/**
 * Core User Document Schema
 */
export interface UserDoc {
  _id?: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "candidate" | "expert" | "admin";
  status: "active" | "suspended";
  profileCompleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillItem {
  id: string;
  name: string;
  level: "Core" | "Intermediate" | "Foundational";
}

export interface ExperienceItem {
  id: string;
  role: string;
  organization: string;
  period: string;
  summary: string;
}

export interface EducationItem {
  id: string;
  degree: string;
  institution: string;
  year: string;
  grade?: string;
}

export interface PublicationItem {
  id: string;
  title: string;
  venue: string;
  year: string;
  url?: string;
}

export interface AwardItem {
  id: string;
  title: string;
  issuer: string;
  year: string;
  description?: string;
}

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string;
  year: string;
}

export type DifficultyTier =
  | "Foundational"
  | "Intermediate"
  | "Senior"
  | "Staff";

export interface InterviewConfig {
  experienceYears: number;
  difficultyTier: DifficultyTier;
  difficultyNumeric: number; // 1 to 4
  primaryTopics: string[];
  focusAreas: string[];
  recommendedTrack: string;
  lastParsedAt?: Date;
}

/**
 * Unified Profile Document Schema for Candidate & Expert workspaces
 */
export interface ProfileDoc {
  _id?: string;
  userId: string;
  headline: string;
  location: string;
  phone: string;
  bio: string;
  links: {
    github: string;
    linkedin: string;
    website: string;
  };
  skills: SkillItem[];
  experience: ExperienceItem[];
  education: EducationItem[];
  publications: PublicationItem[];
  awards: AwardItem[];
  certifications: CertificationItem[];
  interviewConfig?: InterviewConfig;
  rawResumeText?: string;
  updatedAt: Date;
}

/**
 * Activity & Audit Log Document Schema
 */
export interface ActivityLogDoc {
  _id?: string;
  userId: string;
  action: string;
  category: "interview" | "board" | "profile" | "auth";
  detail: string;
  dateKey: string; // YYYY-MM-DD in UTC/local for fast heatmap grouping
  timestamp: Date;
}

export type InterviewType =
  | "coding"
  | "technical"
  | "system_design"
  | "behavioral";

export type MockSessionStage =
  | "warmup"
  | "core"
  | "deep_dive"
  | "scenario"
  | "icebreaker"
  | "technical"
  | "techno_managerial";

export interface MockSessionQuestion {
  id: string;
  order: number;
  stage: MockSessionStage;
  prompt: string;
  rubricHint: string;
  codeStarter?: string;
  constraints?: string[];
  examples?: Array<{ input: string; output: string; explanation?: string }>;
  expectedSignals?: string[];
  /** Pipeline metadata (optional so legacy sessions keep working). */
  topic?: string;
  subtopic?: string;
  difficulty?: number;
  expectedPoints?: string[];
  competencyTags?: string[];
  source?: "curated" | "seeded" | "generated" | "fallback";
  generationMeta?: {
    provider?: string;
    model?: string;
    latencyMs?: number;
    validationReason?: string;
  };
}

export interface MockSessionResponse {
  questionId: string;
  questionPrompt: string;
  stage: string;
  userAnswer: string;
  codeSubmitted?: string;
  language?: string;
  scores: {
    relevance: number;
    depth: number;
    clarity: number;
    overall: number;
  };
  feedback: string;
  submittedAt: Date;
}

/**
 * System Design Mode Types & Schemas
 */
export type SystemDesignPhase =
  | "requirements"
  | "estimation"
  | "high_level_design"
  | "deep_dive"
  | "bottlenecks"
  | "wrap_up";

export interface ScenarioCardScale {
  dau?: string;
  writesPerSec?: string;
  readsPerSec?: string;
  storagePerYear?: string;
  bandwidth?: string;
  notes?: string;
}

export interface ScenarioDeepDiveTopic {
  topic: string;
  probeQuestion: string;
  keyTradeoffs: string[];
}

export interface ScenarioFailureChallenge {
  trigger: string;
  challenge: string;
  expectedHandling: string;
}

export interface ScenarioCard {
  id: string;
  title: string;
  topic: string;
  tags: string[];
  difficulty: DifficultyTier;
  scaleTier: "moderate" | "high" | "hyperscale";
  brief: string; // The opening scenario description presented to the candidate
  hiddenRequirements: {
    functional: string[]; // Revealed only when candidate asks
    nonFunctional: string[]; // Latency, availability SLA, consistency model, etc.
    scale: ScenarioCardScale;
    hiddenConstraints: string[]; // Edge cases, security, special constraints
  };
  expectedComponents: string[];
  deepDiveTopics: ScenarioDeepDiveTopic[];
  failureScenarios: ScenarioFailureChallenge[];
  tradeoffs: string[];
  sampleArchitectureHints?: string[];
}

export interface SystemDesignTurn {
  id: string;
  speaker: "interviewer" | "candidate" | "system";
  phase: SystemDesignPhase;
  message: string;
  moveType?: "clarification" | "nudge" | "probe" | "challenge" | "advance" | "summary";
  revealedRequirement?: string;
  timestamp: Date;
}

export interface SystemDesignSnapshot {
  phase: SystemDesignPhase;
  timestamp: Date;
  elementsCount: number;
  graphSummary: string;
  diagramJson?: string; // Serialized Excalidraw scene JSON
}

export interface SystemDesignEvaluation {
  overallScore: number;
  dimensions: {
    requirementsGathering: { score: number; feedback: string };
    estimation: { score: number; feedback: string };
    architecture: { score: number; feedback: string };
    dataAndApiDesign: { score: number; feedback: string };
    depthAndTradeoffs: { score: number; feedback: string };
    reliabilityAndScale: { score: number; feedback: string };
    communicationAndClarity: { score: number; feedback: string };
  };
  coveredComponents: string[];
  missedComponents: string[];
  strengths: string[];
  weaknesses: string[];
  summaryFeedback: string;
}

export interface SystemDesignSessionDoc {
  _id?: string;
  userId: string;
  candidateName: string;
  scenarioId: string;
  scenarioTitle: string;
  scenario: ScenarioCard;
  level: DifficultyTier;
  durationMinutes: number;
  currentPhase: SystemDesignPhase;
  status: "in_progress" | "completed" | "abandoned";
  revealedRequirements: string[];
  coveredComponents: string[];
  turns: SystemDesignTurn[];
  snapshots: SystemDesignSnapshot[];
  currentDiagramJson?: string;
  currentGraphSummary?: string;
  candidateNotes?: string;
  evaluation?: SystemDesignEvaluation;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mock Interview Session Document Schema
 */
export interface MockSessionDoc {
  _id?: string;
  userId: string;
  candidateName: string;
  title: string;
  interviewType: InterviewType;
  level: DifficultyTier;
  difficultyNumeric: number;
  focus: string; // framework, language or topic (e.g. "React", "Go", "Distributed Systems")
  durationMinutes: number;
  status: "in_progress" | "completed" | "abandoned";
  questions: MockSessionQuestion[];
  responses: MockSessionResponse[];
  /** Total questions planned and generated for the session. */
  plannedQuestionCount: number;
  currentQuestionIndex: number;
  pipeline?: {
    provider?: string;
    model?: string;
    embeddingModel?: string;
    mode?: "generate";
  };
  overallScore?: number;
  categoryScores?: {
    relevance: number;
    depth: number;
    clarity: number;
  };
  summaryFeedback?: string;
  systemDesignEvaluation?: SystemDesignEvaluation;
  systemDesignTurns?: SystemDesignTurn[];
  scenario?: ScenarioCard;
  currentPhase?: SystemDesignPhase;
  roomUrl?: string;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Expert-Hosted Quiz Question Schema
 */
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[]; // typically 4 options [A, B, C, D]
  correctAnswer: string; // The correct option string or option letter (e.g. "A" or the exact option text)
  explanation?: string;
}

/**
 * Expert-Hosted Quiz Document Schema
 */
export interface QuizDoc {
  _id?: string;
  expertId: string;
  expertName: string;
  expertEmail?: string;
  title: string;
  topic: string;
  difficulty: DifficultyTier;
  description: string;
  maxAttempts: number; // e.g. 1, 2, 3... 0 represents unlimited attempts
  timeLimitMinutes?: number; // 0 or undefined represents untimed
  questions: QuizQuestion[];
  totalQuestions: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Candidate Quiz Attempt Document Schema
 */
export interface QuizAttemptQuestionReview {
  questionId: string;
  question: string;
  options: string[];
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface QuizAttemptDoc {
  _id?: string;
  quizId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail?: string;
  attemptNumber: number;
  questionOrder: string[]; // Shuffled question IDs for this attempt
  answers: Record<string, string>; // questionId -> selectedOption
  score: number;
  total: number;
  percentage: number;
  status: "in_progress" | "completed" | "abandoned" | "timed_out";
  timeSpentSeconds?: number;
  breakdown?: QuizAttemptQuestionReview[];
  startedAt?: Date;
  submittedAt?: Date;
}

/**
 * Access helper for Quizzes collection
 */
export async function getQuizzesCollection() {
  const db = await getDatabase();
  return db.collection<QuizDoc>("quizzes");
}

/**
 * Access helper for Quiz Attempts collection
 */
export async function getQuizAttemptsCollection() {
  const db = await getDatabase();
  return db.collection<QuizAttemptDoc>("quiz_attempts");
}

/**
 * Access helper for System Design Sessions collection
 */
export async function getSystemDesignSessionsCollection() {
  const db = await getDatabase();
  return db.collection<SystemDesignSessionDoc>("system_design_sessions");
}
