import { z } from "zod";

export type LlmProviderName = "ollama" | "gemini";

export interface LlmClientInfo {
  provider: LlmProviderName;
  model: string;
}

export interface CompleteJsonOptions<T> {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  label?: string;
}

export interface CompleteJsonResult<T> {
  data: T;
  raw: string;
  latencyMs: number;
  attempts: number;
}

export interface LlmClient extends LlmClientInfo {
  completeJson<T>(options: CompleteJsonOptions<T>): Promise<CompleteJsonResult<T>>;
}

export class LlmError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    message: string,
    options: { code?: string; retryable?: boolean; status?: number } = {}
  ) {
    super(message);
    this.name = "LlmError";
    this.code = options.code || "llm_error";
    this.retryable = options.retryable ?? true;
    this.status = options.status;
  }
}

const DEFAULT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 20_000;
const HARD_TIMEOUT_MS = Number(process.env.LLM_HARD_TIMEOUT_MS) || 40_000;
const MAX_RETRIES = Math.max(0, Number(process.env.LLM_MAX_RETRIES) || 2);
const DEFAULT_TEMPERATURE = Number(process.env.LLM_TEMPERATURE) || 0.7;

export function getConfiguredProvider(): LlmProviderName {
  const configured = (process.env.LLM_PROVIDER || "ollama").toLowerCase();
  if (configured === "gemini") return "gemini";
  if (configured === "auto") {
    return process.env.GEMINI_API_KEY ? "gemini" : "ollama";
  }
  return "ollama";
}

export function getLlmClientInfo(): LlmClientInfo {
  const provider = getConfiguredProvider();
  if (provider === "gemini") {
    return {
      provider,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    };
  }
  return {
    provider,
    model: process.env.OLLAMA_MODEL || "qwen2.5:7b",
  };
}

export function isLlmConfigured(): boolean {
  const provider = getConfiguredProvider();
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  // Ollama has usable defaults; reachability is checked separately.
  return true;
}

function sanitizeJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeJsonSchema);
  if (!value || typeof value !== "object") return value;

  const allowedKeys = new Set([
    "type",
    "format",
    "description",
    "nullable",
    "enum",
    "items",
    "properties",
    "required",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
    "propertyOrdering",
  ]);

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(source)) {
    if (!allowedKeys.has(key)) continue;
    if (key === "properties" && entry && typeof entry === "object") {
      const properties: Record<string, unknown> = {};
      for (const [propertyName, propertySchema] of Object.entries(
        entry as Record<string, unknown>
      )) {
        properties[propertyName] = sanitizeJsonSchema(propertySchema);
      }
      result.properties = properties;
      continue;
    }
    result[key] = sanitizeJsonSchema(entry);
  }

  return result;
}

export function toProviderJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, { io: "output" }) as Record<
    string,
    unknown
  >;
  return sanitizeJsonSchema(jsonSchema) as Record<string, unknown>;
}

function extractJson(raw: string): unknown {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(text);
  } catch {
    const objectStart = text.indexOf("{");
    const objectEnd = text.lastIndexOf("}");
    const arrayStart = text.indexOf("[");
    const arrayEnd = text.lastIndexOf("]");

    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(text.slice(arrayStart, arrayEnd + 1));
      } catch {
        // Fall through to object attempt.
      }
    }

    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(text.slice(objectStart, objectEnd + 1));
    }

    throw new LlmError("Model response was not valid JSON.", {
      code: "invalid_json",
      retryable: true,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new LlmError(`LLM request timed out after ${timeoutMs}ms.`, {
        code: "timeout",
        retryable: true,
      });
    }
    throw new LlmError(
      error instanceof Error ? error.message : "Network request failed.",
      { code: "network_error", retryable: true }
    );
  } finally {
    clearTimeout(timer);
  }
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof LlmError) return error.retryable;
  return true;
}

async function withRetries<T>(
  label: string,
  operation: (attempt: number, timeoutMs: number) => Promise<T>,
  overallDeadline: number
): Promise<{ result: T; attempts: number }> {
  let lastError: unknown;
  const maxAttempts = MAX_RETRIES + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const remaining = overallDeadline - Date.now();
    if (remaining < 800) break;

    const timeoutMs = Math.min(DEFAULT_TIMEOUT_MS, remaining - 250);

    try {
      const result = await operation(attempt, timeoutMs);
      return { result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts - 1 || !shouldRetry(error)) break;

      const backoff = Math.min(
        4_000,
        350 * Math.pow(2, attempt) + Math.floor(Math.random() * 250)
      );
      if (Date.now() + backoff >= overallDeadline) break;

      console.warn(
        `[LLM] ${label} attempt ${attempt + 1} failed; retrying in ${backoff}ms:`,
        error instanceof Error ? error.message : error
      );
      await sleep(backoff);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new LlmError(`LLM request failed for ${label}.`, {
        code: "unknown_llm_error",
      });
}

class OllamaClient implements LlmClient {
  provider: LlmProviderName = "ollama";
  model: string;

  constructor() {
    this.model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
  }

  async completeJson<T>(
    options: CompleteJsonOptions<T>
  ): Promise<CompleteJsonResult<T>> {
    const startedAt = Date.now();
    const deadline =
      startedAt +
      Math.min(options.timeoutMs || HARD_TIMEOUT_MS, HARD_TIMEOUT_MS);
    const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(
      /\/$/,
      ""
    );
    const format = toProviderJsonSchema(options.schema);
    const temperature = options.temperature ?? DEFAULT_TEMPERATURE;

    const { result, attempts } = await withRetries(
      options.label || "ollama.completeJson",
      async (_attempt, timeoutMs) => {
        const response = await fetchWithTimeout(
          `${baseUrl}/api/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: this.model,
              stream: false,
              format,
              keep_alive: process.env.OLLAMA_KEEP_ALIVE || "30m",
              options: {
                temperature,
                num_predict: options.maxOutputTokens || 1200,
              },
              messages: [
                { role: "system", content: options.system },
                { role: "user", content: options.prompt },
              ],
            }),
          },
          timeoutMs
        );

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new LlmError(
            `Ollama returned ${response.status}: ${body.slice(0, 240)}`,
            {
              code: "ollama_http_error",
              retryable: response.status === 429 || response.status >= 500,
              status: response.status,
            }
          );
        }

        const payload = (await response.json()) as {
          message?: { content?: string };
          response?: string;
          error?: string;
        };

        if (payload.error) {
          throw new LlmError(`Ollama error: ${payload.error}`, {
            code: "ollama_error",
            retryable: true,
          });
        }

        const raw = payload.message?.content || payload.response || "";
        if (!raw.trim()) {
          throw new LlmError("Ollama returned an empty response.", {
            code: "empty_response",
            retryable: true,
          });
        }

        const parsed = options.schema.safeParse(extractJson(raw));
        if (!parsed.success) {
          throw new LlmError(
            `Ollama JSON did not match the schema: ${parsed.error.issues
              .slice(0, 3)
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ")}`,
            { code: "schema_mismatch", retryable: true }
          );
        }

        return { data: parsed.data, raw };
      },
      deadline
    );

    return {
      ...result,
      latencyMs: Date.now() - startedAt,
      attempts,
    };
  }
}

class GeminiClient implements LlmClient {
  provider: LlmProviderName = "gemini";
  model: string;

  constructor() {
    this.model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }

  async completeJson<T>(
    options: CompleteJsonOptions<T>
  ): Promise<CompleteJsonResult<T>> {
    const startedAt = Date.now();
    const deadline =
      startedAt +
      Math.min(options.timeoutMs || HARD_TIMEOUT_MS, HARD_TIMEOUT_MS);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new LlmError(
        "GEMINI_API_KEY is not set. Add it server-side or switch LLM_PROVIDER=ollama.",
        { code: "missing_api_key", retryable: false }
      );
    }

    const baseUrl =
      process.env.GEMINI_API_BASE_URL ||
      "https://generativelanguage.googleapis.com/v1beta";
    const responseSchema = toProviderJsonSchema(options.schema);
    const temperature = options.temperature ?? DEFAULT_TEMPERATURE;

    const { result, attempts } = await withRetries(
      options.label || "gemini.completeJson",
      async (_attempt, timeoutMs) => {
        const response = await fetchWithTimeout(
          `${baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: options.system }],
              },
              contents: [
                {
                  role: "user",
                  parts: [{ text: options.prompt }],
                },
              ],
              generationConfig: {
                temperature,
                maxOutputTokens: options.maxOutputTokens || 1600,
                responseMimeType: "application/json",
                responseSchema,
              },
            }),
          },
          timeoutMs
        );

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new LlmError(
            `Gemini returned ${response.status}: ${body.slice(0, 300)}`,
            {
              code: "gemini_http_error",
              retryable: response.status === 429 || response.status >= 500,
              status: response.status,
            }
          );
        }

        const payload = (await response.json()) as {
          promptFeedback?: { blockReason?: string };
          candidates?: Array<{
            finishReason?: string;
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };

        if (payload.promptFeedback?.blockReason) {
          throw new LlmError(
            `Gemini blocked the prompt: ${payload.promptFeedback.blockReason}`,
            { code: "prompt_blocked", retryable: false }
          );
        }

        const candidate = payload.candidates?.[0];
        const raw = (candidate?.content?.parts || [])
          .map((part) => part.text || "")
          .join("")
          .trim();

        if (!raw) {
          throw new LlmError("Gemini returned an empty response.", {
            code: "empty_response",
            retryable: true,
          });
        }

        if (candidate?.finishReason === "MAX_TOKENS") {
          throw new LlmError(
            "Gemini response was truncated by maxOutputTokens.",
            { code: "max_tokens", retryable: true }
          );
        }

        const parsed = options.schema.safeParse(extractJson(raw));
        if (!parsed.success) {
          throw new LlmError(
            `Gemini JSON did not match the schema: ${parsed.error.issues
              .slice(0, 3)
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ")}`,
            { code: "schema_mismatch", retryable: true }
          );
        }

        return { data: parsed.data, raw };
      },
      deadline
    );

    return {
      ...result,
      latencyMs: Date.now() - startedAt,
      attempts,
    };
  }
}

export function getLlmClient(
  providerOverride?: LlmProviderName
): LlmClient {
  const provider = providerOverride || getConfiguredProvider();
  if (provider === "gemini") return new GeminiClient();
  return new OllamaClient();
}

export async function checkOllamaReachable(): Promise<boolean> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(
    /\/$/,
    ""
  );
  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/tags`, {}, 2_500);
    return response.ok;
  } catch {
    return false;
  }
}
