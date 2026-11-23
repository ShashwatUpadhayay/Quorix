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
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [
                  {
                    text: "Given an integer array, return the longest increasing subarray.",
                    topic: "Algorithms & Data Structures",
                    subtopic: "Arrays",
                    difficulty: 2,
                    stage: "icebreaker",
                    expectedPoints: ["Linear traversal", "Run tracking"],
                    competencyTags: ["arrays", "iteration"],
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
