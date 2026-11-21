import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PipelineError, runPipeline } from "@/lib/questionPipeline/pipeline";
import {
  checkRateLimit,
  rateLimitHeaders,
} from "@/lib/questionPipeline/rateLimit";

const RATE_LIMIT = Number(process.env.NEXT_QUESTION_RATE_LIMIT) || 30;
const RATE_WINDOW_MS =
  Number(process.env.NEXT_QUESTION_RATE_WINDOW_MS) || 60_000;

/**
 * POST /api/questions/next
 *
 * Select-only mode: send { mode: "select" }.
 * Generation mode: send { mode: "generate" } (falls back to select on failure).
 *
 * The Gemini key stays server-side. This route is the only public entry point
 * to the pipeline and is rate-limited per authenticated user.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = checkRateLimit({
      key: `questions:next:${user._id}`,
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    });

    if (!rate.allowed) {
      return NextResponse.json(
        {
          error:
            "Too many question requests. Please wait before requesting another question.",
          retryAfterSeconds: rate.retryAfterSeconds,
        },
        { status: 429, headers: rateLimitHeaders(rate) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const run = await runPipeline({
      ...body,
      userId: user._id,
    });

    return NextResponse.json(
      {
        ...run.response,
        diagnostics: run.diagnostics,
      },
      {
        status: 200,
        headers: {
          ...rateLimitHeaders(rate),
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error: unknown) {
    if (error instanceof PipelineError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("[POST /api/questions/next] error:", error);
    return NextResponse.json(
      { error: "Failed to produce the next question." },
      { status: 500 }
    );
  }
}
