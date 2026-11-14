import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase, MockSessionDoc } from "@/lib/mongodb";
import { recordUserActivity } from "@/lib/activity";
import { generateSessionSummary } from "@/lib/mockInterviewEngine";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/mock/session/[id]
 * Retrieves details and transcript of a single mock interview session.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
    }

    const userId = user._id.toString();
    const db = await getDatabase();

    const session = await db.collection<MockSessionDoc>("mock_sessions").findOne({
      _id: new ObjectId(id) as unknown as string,
      userId,
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      session: {
        ...session,
        _id: session._id?.toString(),
      },
    });
  } catch (error: unknown) {
    console.error("[GET /api/mock/session/[id]] error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve session" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mock/session/[id]
 * Finalizes / finishes a mock interview session early or marks completed.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
    }

    const userId = user._id.toString();
    const db = await getDatabase();

    const session = await db.collection<MockSessionDoc>("mock_sessions").findOne({
      _id: new ObjectId(id) as unknown as string,
      userId,
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const summary = generateSessionSummary(
      session.responses,
      session.interviewType,
      session.focus,
      session.level
    );

    const updated = await db
      .collection<MockSessionDoc>("mock_sessions")
      .findOneAndUpdate(
        { _id: new ObjectId(id) as unknown as string },
        {
          $set: {
            status: "completed",
            overallScore: summary.overallScore,
            categoryScores: summary.categoryScores,
            summaryFeedback: summary.summaryFeedback,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );

    await recordUserActivity({
      userId,
      action: "Completed Mock Interview Session",
      category: "interview",
      detail: `${session.title} — Overall Score: ${summary.overallScore}/10 (${session.responses.length} responses evaluated)`,
    });

    return NextResponse.json({
      success: true,
      session: updated
        ? {
            ...updated,
            _id: updated._id?.toString(),
          }
        : session,
    });
  } catch (error: unknown) {
    console.error("[POST /api/mock/session/[id]] error:", error);
    return NextResponse.json(
      { error: "Failed to finish session" },
      { status: 500 }
    );
  }
}
