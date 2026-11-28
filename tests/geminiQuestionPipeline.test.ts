import assert from "node:assert/strict";
import test from "node:test";

import { generateSessionQuestions } from "@/lib/pythonQuestionPipeline";

test("Groq coding sessions use the OpenAI-compatible response shape", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const previousProvider = process.env.LLM_PROVIDER;
  const previousKey = process.env.GROQ_API_KEY;
  const previousModel = process.env.GROQ_MODEL;

  env.NODE_ENV = "production";
  process.env.LLM_PROVIDER = "groq";
  process.env.GROQ_API_KEY = "test-key";
  process.env.GROQ_MODEL = "llama-3.3-70b-versatile";

  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "openai/gpt-oss-120b");
    assert.equal(body.response_format.type, "json_object");
    const payloadText =
      "```json\n" +
      JSON.stringify({
        questions: [
          {
            text: "Given an integer array, return the longest increasing subarray.",
            topic: "Algorithms & Data Structures",
            subtopic: "Arrays",
            difficulty: 2,
            stage: "icebreaker",
            expectedPoints: ["Linear traversal", "Run tracking"],
            competencyTags: ["arrays", "iteration"],
            sampleCases: [
              {
                input: [1, 3, 5, 4, 7],
                output: 3,
              },
            ],
          },
        ],
      }) +
      "\n```\nUnexpected trailing text";
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: payloadText,
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const result = await generateSessionQuestions({
      sessionId: "groq-test",
      interviewType: "coding",
      level: "Intermediate",
      focus: "Arrays",
      count: 1,
    });

    assert.equal(result.provider, "groq");
    assert.equal(result.model, "openai/gpt-oss-120b");
    assert.equal(result.questions.length, 1);
    assert.equal(
      result.questions[0].topic,
      "Algorithms & Data Structures"
    );
    assert.ok(result.questions[0].codeStarter);
    assert.ok(result.questions[0].constraints?.length);
    assert.ok(result.questions[0].examples?.length);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousProvider;
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = previousModel;
  }
});

test("Groq system design sessions require architecture-specific evaluation points", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const previousKey = process.env.GROQ_API_KEY;
  const previousModel = process.env.GROQ_MODEL;
  const previousFetch = globalThis.fetch;
  env.NODE_ENV = "production";
  process.env.GROQ_API_KEY = "test-key";
  process.env.GROQ_MODEL = "openai/gpt-oss-120b";

  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const prompt = body.messages[1].content as string;
    assert.match(prompt, /system architecture design prompts/i);
    assert.match(prompt, /capacity and scaling/i);

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [
                  {
                    text: "Design a global event ingestion platform for one million events per second. Define its APIs, data model, partitioning, backpressure, regional failure recovery, and SLOs.",
                    topic: "System Design",
                    subtopic: "Event Ingestion",
                    difficulty: 3,
                    stage: "icebreaker",
                    expectedPoints: [
                      "Clarify functional requirements and SLOs",
                      "Define components and end-to-end data flow",
                      "Specify APIs and data model",
                      "Estimate throughput and scaling strategy",
                      "Handle reliability, backpressure, and failure modes",
                      "Explain architectural trade-offs",
                    ],
                    competencyTags: ["distributed systems", "event streaming"],
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const result = await generateSessionQuestions({
      sessionId: "groq-system-design-test",
      interviewType: "system_design",
      level: "Senior",
      focus: "Event ingestion",
      count: 1,
    });

    assert.equal(result.provider, "groq");
    assert.equal(result.questions.length, 1);
    assert.equal(result.questions[0].topic, "System Design");
    assert.equal(result.questions[0].expectedPoints?.length, 6);
    assert.equal(result.questions[0].codeStarter, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = previousModel;
  }
});
