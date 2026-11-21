import { spawn } from "node:child_process";
import type {
  DifficultyTier,
  InterviewType,
  MockSessionQuestion,
} from "@/lib/mongodb";

interface PythonQuestionResponse {
  question: {
    id: string;
    text: string;
    topic: string;
    subtopic: string;
    difficulty: number;
    stage: MockSessionQuestion["stage"];
    expected_points: string[];
    competency_tags: string[];
    status: string;
    source: "curated" | "seeded" | "generated" | "fallback";
  };
  source: "curated" | "seeded" | "generated" | "fallback";
  accepted: boolean;
  reason: string;
  attempts: number;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  latencyMs?: number;
  cached?: boolean;
}

function pythonExecutable(): string {
  return process.env.PYTHON_EXECUTABLE || "python";
}

function toSessionQuestion(
  response: PythonQuestionResponse,
  order: number
): MockSessionQuestion {
  const question = response.question;
  return {
    id: question.id,
    order,
    stage: question.stage,
    prompt: question.text,
    rubricHint:
      question.expected_points.length > 0
        ? `Expected points: ${question.expected_points.join("; ")}`
        : "Evaluate relevance, depth and clarity against the question.",
    topic: question.topic,
    subtopic: question.subtopic,
    difficulty: question.difficulty,
    expectedPoints: question.expected_points,
    competencyTags: question.competency_tags,
    expectedSignals: question.expected_points,
    source: response.source,
    generationMeta: {
      provider: response.provider,
      model: response.model,
      validationReason: response.reason,
      latencyMs: response.latencyMs || 0,
    },
  };
}

export async function generateSessionQuestions(params: {
  sessionId: string;
  interviewType: InterviewType;
  level: DifficultyTier;
  focus: string;
  count: number;
  experienceYears?: number;
  tags?: string[];
  topics?: string[];
  focusAreas?: string[];
}): Promise<{
  questions: MockSessionQuestion[];
  provider: string;
  model: string;
}> {
  const sessionSeed = `${params.sessionId}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const payload = JSON.stringify({
    sessionId: params.sessionId,
    sessionSeed,
    interviewType: params.interviewType,
    count: params.count,
    focus: params.focus,
    level: params.level,
    experience: params.experienceYears || 0,
    tags: params.tags || [],
    topics: params.topics || [],
    focusAreas: params.focusAreas || [],
  });

  const timeoutMs = Number(process.env.PYTHON_PIPELINE_TIMEOUT_MS) || 180_000;
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      /* turbopackIgnore: true */
      pythonExecutable(),
      ["-u", "-m", "python_pipeline.cli", "batch"],
      {
        cwd: process.cwd(),
        env: process.env,
      }
    );
    let output = "";
    let errorOutput = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Python question pipeline timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            errorOutput.trim() ||
              `Python question pipeline exited with code ${code}.`
          )
        );
        return;
      }
      resolve(output);
    });

    child.stdin.end(payload);
  });

  const responses = JSON.parse(stdout.trim()) as PythonQuestionResponse[];
  if (!Array.isArray(responses) || responses.length !== params.count) {
    throw new Error(
      `Python question pipeline returned ${responses?.length || 0} questions; expected ${params.count}.`
    );
  }

  const generated = responses.map((response, index) =>
    toSessionQuestion(response, index + 1)
  );
  return {
    questions: generated,
    provider: responses.find((response) => response.provider === "ollama")
      ?.provider || "local",
    model: responses.find((response) => response.provider === "ollama")?.model ||
      "curated-bank",
  };
}
