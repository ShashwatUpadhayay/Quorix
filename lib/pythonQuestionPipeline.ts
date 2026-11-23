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
    codeStarter?: string;
    constraints?: string[];
    examples?: Array<{ input: string; output: string; explanation?: string }>;
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

function toText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value).trim();
  } catch {
    return String(value).trim();
  }
}

function pythonExecutable(): string {
  return process.env.PYTHON_EXECUTABLE || "python";
}

function providerName(): "ollama" | "gemini" | "groq" {
  return process.env.NODE_ENV === "production" ? "groq" : "ollama";
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  provider: "Gemini" | "Groq"
): Promise<Response> {
  const isGroq = provider === "Groq";
  const maxRetries = Math.max(
    1,
    Number(
      isGroq
        ? process.env.GROQ_MAX_RETRIES
        : process.env.GEMINI_MAX_RETRIES
    ) || 4
  );
  const retryableStatuses = new Set([429, 503, 504]);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(
          Number(
            isGroq
              ? process.env.GROQ_TIMEOUT_MS
              : process.env.GEMINI_TIMEOUT_MS
          ) || 120_000
        ),
      });

      if (
        response.ok ||
        !retryableStatuses.has(response.status) ||
        attempt === maxRetries
      ) {
        return response;
      }

      const baseDelay =
        Number(
          isGroq
            ? process.env.GROQ_RETRY_BASE_MS
            : process.env.GEMINI_RETRY_BASE_MS
        ) || 1_000;
      const delay = Math.min(
        15_000,
        baseDelay * 2 ** (attempt - 1) +
          Math.floor(Math.random() * 500)
      );
      console.warn(
        `[${provider}] HTTP ${response.status}; retrying in ${delay}ms (${attempt}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const baseDelay =
        Number(
          isGroq
            ? process.env.GROQ_RETRY_BASE_MS
            : process.env.GEMINI_RETRY_BASE_MS
        ) || 1_000;
      const delay = Math.min(
        15_000,
        baseDelay * 2 ** (attempt - 1)
      );
      console.warn(
        `[${provider}] Request failed; retrying in ${delay}ms (${attempt}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(`${provider} retries exhausted`);
}

export function generateFallbackSessionQuestions(params: {
  sessionId: string;
  interviewType: InterviewType;
  level: DifficultyTier;
  focus: string;
  count: number;
}): MockSessionQuestion[] {
  const ranges: Record<DifficultyTier, [number, number]> = {
    Foundational: [1, 2],
    Intermediate: [2, 3],
    Senior: [3, 4],
    Staff: [4, 5],
  };
  const [low, high] = ranges[params.level];
  const prompts: Record<InterviewType, string[]> = {
    technical: [
      `Explain how you would diagnose and improve a production issue in ${params.focus}.`,
      `Design a resilient ${params.focus} solution and explain the key trade-offs.`,
      `How would you scale ${params.focus} while preserving correctness and observability?`,
      `Describe a failure scenario in ${params.focus} and how you would prevent recurrence.`,
      `How would you lead a major ${params.focus} migration across production systems?`,
    ],
    coding: [
      `Implement a solution for a realistic ${params.focus} coding problem and analyze complexity.`,
      `Solve a data-structure problem in ${params.focus} with edge-case coverage.`,
      `Design an efficient algorithm for ${params.focus} and discuss trade-offs.`,
      `Implement and test a concurrent ${params.focus} workflow safely.`,
      `Optimize a large-scale ${params.focus} algorithm for latency and memory.`,
    ],
    system_design: [
      `Design a reliable system around ${params.focus} from requirements to deployment.`,
      `Scale ${params.focus} across regions while protecting consistency and availability.`,
      `Plan an incident-safe rollout of ${params.focus} in a distributed environment.`,
      `Estimate capacity and define SLOs for a production ${params.focus} platform.`,
      `Lead the architectural evolution of ${params.focus} across multiple teams.`,
    ],
    behavioral: [
      `Describe a difficult ${params.focus} decision you owned and explain your trade-offs.`,
      `Tell me about resolving a ${params.focus} conflict on an engineering team.`,
      `Describe how you mentored others during a ${params.focus} delivery.`,
      `Explain how you led an incident involving ${params.focus}.`,
      `How did you align stakeholders around a ${params.focus} technical strategy?`,
    ],
  };

  return Array.from({ length: params.count }, (_, index) => {
    const progress = index / Math.max(params.count - 1, 1);
    const difficulty = Math.round(low + (high - low) * progress);
    const stage =
      index === 0
        ? "icebreaker"
        : index === params.count - 1
          ? "techno_managerial"
          : "technical";
    return {
      id: `fallback-${params.sessionId}-${index + 1}`,
      order: index + 1,
      stage,
      prompt:
        prompts[params.interviewType][
          index % prompts[params.interviewType].length
        ],
      rubricHint: `Evaluate relevance, depth, trade-offs and concrete production thinking for ${params.level}.`,
      topic: params.focus,
      subtopic: params.focus,
      difficulty,
      ...(params.interviewType === "coding"
        ? {
            codeStarter:
              "function solution(input) {\n" +
              "  // Implement your solution here\n" +
              "}\n",
            constraints: [
              "Handle empty and boundary inputs",
              "Optimize for the stated problem size",
              "Explain time and space complexity",
            ],
            examples: [
              {
                input: "input = sample input",
                output: "expected output",
                explanation: "Validate the solution against the stated constraints.",
              },
            ],
          }
        : {}),
      expectedPoints: [
        "Concrete reasoning",
        "Trade-offs",
        "Failure handling",
        "Measurable outcome",
      ],
      competencyTags: [params.focus, params.level, params.interviewType],
      expectedSignals: ["clarity", "depth", "production reasoning"],
      source: "fallback",
      generationMeta: {
        provider: "local",
        model: "curated-fallback",
        validationReason: "Configured AI provider unavailable; local fallback used",
      },
    };
  });
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

  const model =
    process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
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
  const sessionSeed = `${params.sessionId}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const questionSpecs: Array<{
    questionNumber: number;
    difficulty: number;
    stage: MockSessionQuestion["stage"];
  }> = Array.from({ length: params.count }, (_, index) => {
    const questionNumber = index + 1;
    const progress = index / Math.max(params.count - 1, 1);
    const difficulty = Math.round(low + (high - low) * progress);
    const stage =
      questionNumber === 1
        ? "icebreaker"
        : questionNumber === params.count
          ? "techno_managerial"
          : "technical";
    return { questionNumber, difficulty, stage };
  });

  const prompt = `Create ${params.count} distinct interview questions for one mock interview.
Session variation seed: ${sessionSeed}
Interview type: ${params.interviewType}
Candidate level: ${params.level}
Experience: ${params.experienceYears || 0} years
Focus: ${params.focus}
Competency tags: ${(params.tags || []).join(", ") || "not provided"}
Primary topics: ${(params.topics || []).join(", ") || "not provided"}
Focus areas: ${(params.focusAreas || []).join(", ") || "not provided"}

Question plan:
${questionSpecs
  .map(
    (item) =>
      `- Question ${item.questionNumber}: stage=${item.stage}, difficulty=${item.difficulty}/5`
  )
  .join("\n")}

Requirements:
- Every question must be different and not paraphrase another question.
- Match the stage and difficulty exactly.
- Provide 2-5 expectedPoints and 1-6 competencyTags.
${
  params.interviewType === "coding"
    ? `- Generate genuine coding interview / DSA problems only.
- Each problem must include the input format, output format, constraints, at least one sample test case, and an intended algorithm category.
- Each codeStarter must be a valid function scaffold for JavaScript/TypeScript with no solution implementation.
- Keep constraints and sample test cases internally consistent.
- Do not produce system design, conceptual, or behavioral questions.`
    : `- Use 1-3 self-contained sentences grounded in a realistic engineering scenario.`
}
- Return a JSON object containing only one "questions" array.`;

  const questionSchema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: params.count,
        maxItems: params.count,
        items: {
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
              minItems: 2,
              maxItems: 8,
            },
            competencyTags: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 10,
            },
            codeStarter: { type: "string" },
            constraints: {
              type: "array",
              items: { type: "string" },
            },
            examples: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  input: { type: "string" },
                  output: { type: "string" },
                  explanation: { type: "string" },
                },
                required: ["input", "output"],
              },
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
            ...(params.interviewType === "coding"
              ? ["codeStarter", "constraints", "examples"]
              : []),
          ],
        },
      },
    },
    required: ["questions"],
  };

  const body = JSON.stringify({
    systemInstruction: {
      parts: [
        {
          text:
            params.interviewType === "coding"
              ? "You are a senior coding interviewer specializing in DSA. Return only valid JSON. Generate self-contained algorithm problems with starter code, constraints, and sample cases."
              : "You are a senior technical interviewer. Return only valid JSON.",
        },
      ],
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: params.interviewType === "coding" ? 0.65 : 0.8,
      maxOutputTokens: params.interviewType === "coding" ? 3000 : 1800,
      responseMimeType: "application/json",
      responseSchema: questionSchema,
    },
  });

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body,
  }, "Gemini");

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
  let raw = (payload.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
  if (!raw) throw new Error("Gemini returned an empty response");
  if (raw.startsWith("```")) {
    raw = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  const parsed = JSON.parse(raw) as {
    questions: Array<{
      text: string;
      topic: string;
      subtopic: string;
      difficulty: number;
      stage: PythonQuestionResponse["question"]["stage"];
      expectedPoints: string[];
      competencyTags: string[];
      codeStarter?: string;
      constraints?: string[];
      examples?: Array<{ input: string; output: string; explanation?: string }>;
    }>;
  };
  if (!Array.isArray(parsed.questions) || parsed.questions.length !== params.count) {
    throw new Error(
      `Gemini returned ${parsed.questions?.length || 0} questions; expected ${params.count}`
    );
  }

  if (params.interviewType === "coding") {
    for (const question of parsed.questions) {
      if (
        !question.text?.trim() ||
        !question.codeStarter?.trim() ||
        !Array.isArray(question.constraints) ||
        question.constraints.length === 0 ||
        !Array.isArray(question.examples) ||
        question.examples.length === 0 ||
        !question.examples.every(
          (example) =>
            toText(example.input).length > 0 &&
            toText(example.output).length > 0
        )
      ) {
        throw new Error(
          "Gemini returned an incomplete coding or DSA question"
        );
      }
    }
  }

  return parsed.questions.map((question, index) => {
    const spec = questionSpecs[index];
    return {
      question: {
        id: `${params.sessionId}-${index + 1}-${sessionSeed.slice(-8)}`,
        text: question.text,
        topic: question.topic,
        subtopic: question.subtopic,
        difficulty: spec.difficulty,
        stage: spec.stage,
        expected_points: question.expectedPoints,
        competency_tags: question.competencyTags,
        status: "draft",
        source: "generated",
        codeStarter:
          params.interviewType === "coding"
            ? question.codeStarter ||
              "function solution(input) {\n" +
                "  // Implement your solution here\n" +
                "}\n"
            : undefined,
        constraints:
          params.interviewType === "coding"
            ? question.constraints || [
                "Handle empty and boundary inputs",
                "Optimize for the stated problem size",
                "Explain time and space complexity",
              ]
            : undefined,
        examples:
          params.interviewType === "coding"
            ? question.examples || [
                {
                  input: "input = sample input",
                  output: "expected output",
                  explanation:
                    "Validate the solution against the stated constraints.",
                },
              ]
            : undefined,
      },
      source: "generated",
      accepted: true,
      reason: "Generated and accepted by Gemini",
      attempts: 1,
      provider: "gemini",
      model,
      fallbackUsed: false,
    };
  });
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
    codeStarter: question.codeStarter,
    constraints: question.constraints,
    examples: question.examples,
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

async function generateWithGroq(params: {
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
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const configuredModel = process.env.GROQ_MODEL?.trim();
  const deprecatedGroqModels = new Set([
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
  ]);
  const model =
    !configuredModel || deprecatedGroqModels.has(configuredModel)
      ? "openai/gpt-oss-120b"
      : configuredModel;
  const baseUrl =
    process.env.GROQ_API_BASE_URL || "https://api.groq.com/openai/v1";
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const ranges: Record<DifficultyTier, [number, number]> = {
    Foundational: [1, 2],
    Intermediate: [2, 3],
    Senior: [3, 4],
    Staff: [4, 5],
  };
  const [low, high] = ranges[params.level];
  const sessionSeed = `${params.sessionId}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const questionSpecs: Array<{
    difficulty: number;
    stage: MockSessionQuestion["stage"];
  }> = Array.from({ length: params.count }, (_, index) => {
    const difficulty = Math.round(
      low +
        (high - low) *
          (index / Math.max(params.count - 1, 1))
    );
    const stage =
      index === 0
        ? "icebreaker"
        : index === params.count - 1
          ? "techno_managerial"
          : "technical";
    return { difficulty, stage };
  });

  const coding = params.interviewType === "coding";
  const prompt = `Create ${params.count} distinct interview questions for one mock interview.
Session variation seed: ${sessionSeed}
Interview type: ${params.interviewType}
Candidate level: ${params.level}
Experience: ${params.experienceYears || 0} years
Focus: ${params.focus}
Competency tags: ${(params.tags || []).join(", ") || "not provided"}
Primary topics: ${(params.topics || []).join(", ") || "not provided"}
Focus areas: ${(params.focusAreas || []).join(", ") || "not provided"}

Question plan:
${questionSpecs
  .map(
    (item, index) =>
      `- Question ${index + 1}: stage=${item.stage}, difficulty=${item.difficulty}/5`
  )
  .join("\n")}

Requirements:
- Every question must be different and not paraphrase another question.
- Match the stage and difficulty exactly.
- Provide 2-5 expectedPoints and 1-6 competencyTags.
${
  coding
    ? `- Generate genuine coding interview / DSA problems only.
- Each problem must include the input format, output format, constraints, at least one sample test case, and an intended algorithm category.
- Each codeStarter must be a valid function scaffold for JavaScript/TypeScript with no solution implementation.
- Keep constraints and sample test cases internally consistent.
- Do not produce system design, conceptual, or behavioral questions.`
    : `- Use 1-3 self-contained sentences grounded in a realistic engineering scenario.`
}
- Return a JSON object containing only one "questions" array.
- Each question must contain text, topic, subtopic, difficulty, stage, expectedPoints, and competencyTags.
${
  coding
    ? `- Coding questions must also contain codeStarter, constraints, and examples (with input and output).`
    : ""
}`;

  const body = JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content: coding
          ? "You are a senior coding interviewer specializing in DSA. Return only valid JSON. Generate self-contained algorithm problems with starter code, constraints, and sample cases."
          : "You are a senior technical interviewer. Return only valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    temperature: coding ? 0.65 : 0.8,
    max_completion_tokens: coding ? 3000 : 1800,
    response_format: { type: "json_object" },
  });

  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    },
    "Groq"
  );

  if (!response.ok) {
    throw new Error(
      `Groq returned HTTP ${response.status}: ${(
        await response.text()
      ).slice(0, 500)}`
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  let raw = payload.choices?.[0]?.message?.content?.trim() || "";
  if (!raw) throw new Error("Groq returned an empty response");
  if (raw.startsWith("```")) {
    raw = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  if (!raw.startsWith("{")) {
    const objectStart = raw.indexOf("{");
    const objectEnd = raw.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      raw = raw.slice(objectStart, objectEnd + 1);
    }
  }

  const parsed = JSON.parse(raw) as {
    questions: Array<{
      text: string;
      topic: string;
      subtopic: string;
      difficulty: number;
      stage: PythonQuestionResponse["question"]["stage"];
      expectedPoints: string[];
      competencyTags: string[];
      codeStarter?: unknown;
      constraints?: unknown[];
      examples?: Array<{ input: unknown; output: unknown; explanation?: unknown }>;
      code?: unknown;
      starterCode?: unknown;
      sampleCases?: Array<{ input: unknown; output: unknown; explanation?: unknown }>;
      examplesSample?: Array<{ input: unknown; output: unknown; explanation?: unknown }>;
    }>;
  };
  if (!Array.isArray(parsed.questions) || parsed.questions.length !== params.count) {
    throw new Error(
      `Groq returned ${parsed.questions?.length || 0} questions; expected ${params.count}`
    );
  }

  return parsed.questions.map((question, index) => {
    const spec = questionSpecs[index];
    const codeStarter =
      toText(question.codeStarter) ||
      toText(question.starterCode) ||
      toText(question.code);
    const examples =
      question.examples ||
      question.sampleCases ||
      question.examplesSample;
    const validExamples = Array.isArray(examples)
      ? examples
          .map((example) => ({
            input: toText(example.input),
            output: toText(example.output),
            explanation: toText(example.explanation),
          }))
          .filter((example) => example.input && example.output)
      : [];

    const problemText = toText(question.text);
    if (!problemText) {
      throw new Error("Groq returned a coding or DSA question without problem text");
    }

    const expectedPoints =
      Array.isArray(question.expectedPoints) &&
      question.expectedPoints.length > 0
        ? question.expectedPoints.map(toText).filter(Boolean)
        : ["Correctness", "Edge cases", "Time complexity", "Space complexity"];
    const normalizedExpectedPoints =
      expectedPoints.length > 0
        ? expectedPoints
        : ["Correctness", "Edge cases", "Time complexity", "Space complexity"];
    const competencyTags =
      Array.isArray(question.competencyTags) &&
      question.competencyTags.length > 0
        ? question.competencyTags.map(toText).filter(Boolean)
        : [params.focus, "DSA"];
    const normalizedCompetencyTags =
      competencyTags.length > 0 ? competencyTags : [params.focus, "DSA"];

    return {
      question: {
        id: `${params.sessionId}-${index + 1}-${sessionSeed.slice(-8)}`,
        text: problemText,
        topic: toText(question.topic) || "Algorithms & Data Structures",
        subtopic: toText(question.subtopic) || params.focus,
        difficulty: spec.difficulty,
        stage: spec.stage,
        expected_points: normalizedExpectedPoints,
        competency_tags: normalizedCompetencyTags,
        status: "draft",
        source: "generated",
        codeStarter: coding
          ? codeStarter ||
            "function solution(input) {\n  // Implement your solution here\n}\n"
          : undefined,
        constraints: coding
          ? (Array.isArray(question.constraints) &&
              question.constraints.length > 0
              ? question.constraints.map(toText).filter(Boolean)
              : [
              "Handle empty and boundary inputs",
              "Optimize for the stated problem size",
              "Explain time and space complexity",
              ])
          : undefined,
        examples: coding
          ? (validExamples.length > 0
              ? validExamples
              : [
              {
                input: "input = sample input",
                output: "expected output",
                explanation: "Validate the solution against the stated constraints.",
              },
              ])
          : undefined,
      },
      source: "generated",
      accepted: true,
      reason: "Generated and accepted by Groq",
      attempts: 1,
      provider: "groq",
      model,
      fallbackUsed: false,
    };
  });
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
  if (providerName() === "groq") {
    try {
      const responses = await generateWithGroq(params);
      return {
        questions: responses.map((response, index) =>
          toSessionQuestion(response, index + 1)
        ),
        provider: "groq",
        model: (() => {
          const configuredModel = process.env.GROQ_MODEL?.trim();
          return !configuredModel ||
            configuredModel === "llama-3.3-70b-versatile" ||
            configuredModel === "llama-3.1-70b-versatile"
            ? "openai/gpt-oss-120b"
            : configuredModel;
        })(),
      };
    } catch (error) {
      console.error(
        "[Groq] Batch generation failed; using local fallback:",
        error instanceof Error ? error.message : error
      );
      const questions = generateFallbackSessionQuestions(params);
      return {
        questions,
        provider: "local",
        model: "curated-fallback",
      };
    }
  }

  if (providerName() === "gemini") {
    try {
      const responses = await generateWithGemini(params);
      return {
        questions: responses.map((response, index) =>
          toSessionQuestion(response, index + 1)
        ),
        provider: "gemini",
        model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      };
    } catch (error) {
      console.error(
        "[Gemini] Batch generation failed; using local fallback:",
        error instanceof Error ? error.message : error
      );
      const questions = generateFallbackSessionQuestions(params);
      return {
        questions,
        provider: "local",
        model: "curated-fallback",
      };
    }
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
