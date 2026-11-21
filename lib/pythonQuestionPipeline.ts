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

function providerName(): "ollama" | "gemini" {
  const provider = (process.env.LLM_PROVIDER || "ollama").toLowerCase();
  return provider === "gemini" ? "gemini" : "ollama";
}

async function generateWithGemini(params: {
  sessionId: string;
  interviewType: InterviewType;
  level: DifficultyTier;
  focus: string;
  count: number;
  experienceYears?: number;
  tags?: string[];
  topics?: string[];
  focusAreas?: string[];
}): Promise<PythonQuestionResponse[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const baseUrl =
    process.env.GEMINI_API_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta";
  const url = `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(
    model
  )}:generateContent`;
  const ranges: Record<DifficultyTier, [number, number]> = {
    Foundational: [1, 2],
    Intermediate: [2, 3],
    Senior: [3, 4],
    Staff: [4, 5],
  };
  const [low, high] = ranges[params.level];
  const responses: PythonQuestionResponse[] = [];
  const asked: string[] = [];

  for (let index = 0; index < params.count; index += 1) {
    const questionNumber = index + 1;
    const progress = index / Math.max(params.count - 1, 1);
    const difficulty = Math.round(low + (high - low) * progress);
    const stage =
      questionNumber === 1
        ? "icebreaker"
        : questionNumber === params.count
          ? "techno_managerial"
          : "technical";
    const seed = `${params.sessionId}-${Date.now()}-${questionNumber}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const prompt = `Create exactly one unique interview question.
Session variation seed: ${seed}
Interview type: ${params.interviewType}
Candidate level: ${params.level}
Experience: ${params.experienceYears || 0} years
Focus: ${params.focus}
Competency tags: ${(params.tags || []).join(", ") || "not provided"}
Primary topics: ${(params.topics || []).join(", ") || "not provided"}
Focus areas: ${(params.focusAreas || []).join(", ") || "not provided"}
Position: ${questionNumber} of ${params.count}
Stage: ${stage}
Difficulty: ${difficulty}/5

Do not repeat or paraphrase these already generated questions:
${asked.map((text) => `- ${text}`).join("\n") || "- none"}

Return JSON with text, topic, subtopic, difficulty, stage, expectedPoints, competencyTags.`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "You are a senior technical interviewer. Return only valid JSON.",
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1200,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              text: { type: "string" },
              topic: { type: "string" },
              subtopic: { type: "string" },
              difficulty: { type: "integer", minimum: 1, maximum: 5 },
              stage: {
                type: "string",
                enum: ["icebreaker", "technical", "techno_managerial"],
              },
              expectedPoints: {
                type: "array",
                items: { type: "string" },
              },
              competencyTags: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: [
              "text",
              "topic",
              "subtopic",
              "difficulty",
              "stage",
              "expectedPoints",
              "competencyTags",
            ],
          },
        },
      }),
      signal: AbortSignal.timeout(
        Number(process.env.GEMINI_TIMEOUT_MS) || 120_000
      ),
    });
    if (!response.ok) {
      throw new Error(
        `Gemini returned HTTP ${response.status}: ${(
          await response.text()
        ).slice(0, 500)}`
      );
    }
    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const raw = (payload.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();
    if (!raw) throw new Error("Gemini returned an empty response");
    const parsed = JSON.parse(raw) as {
      text: string;
      topic: string;
      subtopic: string;
      difficulty: number;
      stage: PythonQuestionResponse["question"]["stage"];
      expectedPoints: string[];
      competencyTags: string[];
    };
    asked.push(parsed.text);
    responses.push({
      question: {
        id: `${params.sessionId}-${questionNumber}-${seed.slice(-8)}`,
        text: parsed.text,
        topic: parsed.topic,
        subtopic: parsed.subtopic,
        difficulty: parsed.difficulty,
        stage: parsed.stage,
        expected_points: parsed.expectedPoints,
        competency_tags: parsed.competencyTags,
        status: "draft",
        source: "generated",
      },
      source: "generated",
      accepted: true,
      reason: "Generated and accepted by Gemini",
      attempts: 1,
      provider: "gemini",
      model,
      fallbackUsed: false,
    });
  }

  return responses;
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
  if (providerName() === "gemini") {
    const responses = await generateWithGemini(params);
    return {
      questions: responses.map((response, index) =>
        toSessionQuestion(response, index + 1)
      ),
      provider: "gemini",
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    };
  }

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
