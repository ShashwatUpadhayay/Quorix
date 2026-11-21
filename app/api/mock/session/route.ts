import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase, MockSessionDoc, DifficultyTier, InterviewType } from "@/lib/mongodb";
import { recordUserActivity } from "@/lib/activity";
import { getQuestionCountForDuration } from "@/lib/mockInterviewEngine";
import { generateSessionQuestions } from "@/lib/pythonQuestionPipeline";

const TIER_NUMERIC_MAP: Record<DifficultyTier, number> = {
  Foundational: 1,
  Intermediate: 2,
  Senior: 3,
  Staff: 4,
};

/**
 * GET /api/mock/session
 * Lists all mock interview sessions for the current authenticated candidate.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user._id.toString();
    const db = await getDatabase();

    const sessions = await db
      .collection<MockSessionDoc>("mock_sessions")
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        ...s,
        _id: s._id?.toString(),
      })),
    });
  } catch (error: unknown) {
    console.error("[GET /api/mock/session] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch mock interview history" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mock/session
 * Initializes a new mock interview session with tailored questions.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user._id.toString();
    const body = await req.json();

    const interviewType: InterviewType =
      body.interviewType &&
      ["coding", "technical", "system_design", "behavioral"].includes(
        body.interviewType
      )
        ? body.interviewType
        : "technical";

    const level: DifficultyTier =
      body.level &&
      ["Foundational", "Intermediate", "Senior", "Staff"].includes(body.level)
        ? body.level
        : "Intermediate";

    const focus: string =
      typeof body.focus === "string" && body.focus.trim()
        ? body.focus.trim()
        : "Fullstack Architecture";

    const durationMinutes = Number(body.durationMinutes) || 30;
    const plannedQuestionCount = getQuestionCountForDuration(durationMinutes);

    const typeLabels: Record<InterviewType, string> = {
      coding: "Coding & Algorithms",
      technical: "Technical Deep-Dive",
      system_design: "System Design",
      behavioral: "Behavioral & Leadership",
    };

    const title = `${level} ${focus} ${typeLabels[interviewType]}`;

    const newSession: MockSessionDoc = {
      userId,
      candidateName: user.name || "Candidate",
      title,
      interviewType,
      level,
      difficultyNumeric: TIER_NUMERIC_MAP[level] || 2,
      focus,
      durationMinutes,
      status: "in_progress",
      questions: [],
      responses: [],
      plannedQuestionCount,
      currentQuestionIndex: 0,
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = await getDatabase();
    const collection = db.collection<MockSessionDoc>("mock_sessions");
    const result = await collection.insertOne(newSession);
    const sessionId = result.insertedId.toString();

    try {
      const profile = await db.collection("profiles").findOne({ userId });
      const profileDoc = profile as {
        skills?: Array<{ name?: string }>;
        headline?: string;
        interviewConfig?: {
          experienceYears?: number;
          primaryTopics?: string[];
          focusAreas?: string[];
        };
      } | null;

      const generated = await generateSessionQuestions({
        sessionId,
        interviewType,
        level,
        focus,
        count: plannedQuestionCount,
        experienceYears:
          profileDoc?.interviewConfig?.experienceYears || 0,
        tags: (profileDoc?.skills || [])
          .map((skill) => skill.name)
          .filter((name): name is string => Boolean(name)),
        topics: profileDoc?.interviewConfig?.primaryTopics || [],
        focusAreas: profileDoc?.interviewConfig?.focusAreas || [],
      });

      newSession.questions = generated.questions;
      newSession.pipeline = {
        provider: generated.provider,
        model: generated.model,
        mode: "generate",
      };

      await collection.updateOne(
        { _id: result.insertedId },
        {
          $set: {
            questions: newSession.questions,
            pipeline: newSession.pipeline,
            updatedAt: new Date(),
          },
        }
      );
    } catch (error) {
      await collection.deleteOne({ _id: result.insertedId }).catch(() => {});
      throw error;
    }

    // Log activity
    await recordUserActivity({
      userId,
      action: "Initiated Mock Interview Session",
      category: "interview",
      detail: `${title} (${durationMinutes} mins · ${plannedQuestionCount} planned questions)`,
    });

    return NextResponse.json({
      success: true,
      sessionId,
      roomUrl: `/candidate/mock/${sessionId}`,
      session: {
        ...newSession,
        _id: sessionId,
      },
    });
  } catch (error: unknown) {
    console.error("[POST /api/mock/session] error:", error);
    return NextResponse.json(
      { error: "Failed to initialize mock interview session" },
      { status: 500 }
    );
  }
}
