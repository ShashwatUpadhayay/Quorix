import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDatabase,
  getSystemDesignSessionsCollection,
  MockSessionDoc,
  SystemDesignSessionDoc,
  DifficultyTier,
  InterviewType,
} from "@/lib/mongodb";
import { recordUserActivity } from "@/lib/activity";
import { getQuestionCountForDuration } from "@/lib/mockInterviewEngine";
import {
  generateFallbackSessionQuestions,
  generateSessionQuestions,
} from "@/lib/pythonQuestionPipeline";
import {
  selectScenarioForCandidate,
  getScenarioById,
} from "@/lib/systemDesignScenarios";

const TIER_NUMERIC_MAP: Record<DifficultyTier, number> = {
  Foundational: 1,
  Intermediate: 2,
  Senior: 3,
  Staff: 4,
};

/**
 * GET /api/mock/session
 * Lists all mock interview sessions (standard & system design) for the current authenticated candidate.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user._id.toString();
    const db = await getDatabase();

    const [standardSessions, systemDesignSessions] = await Promise.all([
      db
        .collection<MockSessionDoc>("mock_sessions")
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
      db
        .collection<SystemDesignSessionDoc>("system_design_sessions")
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
    ]);

    const formattedStandard = standardSessions.map((s) => ({
      ...s,
      _id: s._id?.toString(),
      roomUrl: `/candidate/mock/${s._id?.toString()}`,
    }));

    const formattedSystemDesign = systemDesignSessions.map((s) => ({
      _id: s._id?.toString(),
      userId: s.userId,
      candidateName: s.candidateName,
      title: `${s.level} ${s.scenarioTitle} System Design`,
      interviewType: "system_design" as InterviewType,
      level: s.level,
      difficultyNumeric: TIER_NUMERIC_MAP[s.level] || 2,
      focus: s.scenarioTitle,
      durationMinutes: s.durationMinutes,
      status: s.status,
      questions: [],
      responses: [],
      plannedQuestionCount: 1,
      currentQuestionIndex: 0,
      overallScore: s.evaluation?.overallScore,
      summaryFeedback: s.evaluation?.summaryFeedback,
      systemDesignEvaluation: s.evaluation,
      systemDesignTurns: s.turns,
      scenario: s.scenario,
      currentPhase: s.currentPhase,
      roomUrl: `/candidate/mock/system-design/${s._id?.toString()}`,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    const allSessions = [...formattedStandard, ...formattedSystemDesign].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({
      sessions: allSessions,
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
 * Initializes a new mock interview session with tailored questions or System Design scenario.
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

    // Handle System Design mode separately
    if (interviewType === "system_design") {
      const db = await getDatabase();
      const profile = await db.collection("profiles").findOne({ userId });
      const profileDoc = profile as {
        skills?: Array<{ name?: string }>;
        interviewConfig?: {
          primaryTopics?: string[];
          focusAreas?: string[];
        };
      } | null;

      const candidateTags = [
        ...(profileDoc?.skills || []).map((s) => s.name || "").filter(Boolean),
        ...(profileDoc?.interviewConfig?.primaryTopics || []),
        ...(profileDoc?.interviewConfig?.focusAreas || []),
        focus,
      ];

      const scenario = body.scenarioId
        ? getScenarioById(body.scenarioId) ||
          selectScenarioForCandidate(candidateTags, level, focus)
        : selectScenarioForCandidate(candidateTags, level, focus);

      const openingMessage = `Welcome to your System Design interview for **${scenario.title}**.

Here is your scenario:
> "${scenario.brief}"

Take a moment to digest this. We have about ${durationMinutes} minutes. You are driving the session.
To start, what questions do you have about the functional scope or non-functional scale and constraints?`;

      const newSystemDesignSession: Omit<SystemDesignSessionDoc, "_id"> = {
        userId,
        candidateName: user.name || "Candidate",
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        scenario,
        level,
        durationMinutes,
        currentPhase: "requirements",
        status: "in_progress",
        revealedRequirements: [],
        coveredComponents: [],
        turns: [
          {
            id: `turn_${Date.now()}_0`,
            speaker: "interviewer",
            phase: "requirements",
            message: openingMessage,
            moveType: "nudge",
            timestamp: new Date(),
          },
        ],
        snapshots: [],
        candidateNotes: "",
        startedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sdCollection = await getSystemDesignSessionsCollection();
      const result = await sdCollection.insertOne(
        newSystemDesignSession as SystemDesignSessionDoc
      );
      const sessionId = result.insertedId.toString();

      await recordUserActivity({
        userId,
        action: "Initiated System Design Session",
        category: "interview",
        detail: `${scenario.title} (${level} · ${durationMinutes} mins)`,
      });

      return NextResponse.json({
        success: true,
        sessionId,
        roomUrl: `/candidate/mock/system-design/${sessionId}`,
        session: {
          ...newSystemDesignSession,
          _id: sessionId,
          roomUrl: `/candidate/mock/system-design/${sessionId}`,
        },
      });
    }
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
      console.error(
        "[POST /api/mock/session] question generation failed:",
        error instanceof Error ? error.message : error
      );
      newSession.questions = generateFallbackSessionQuestions({
        sessionId,
        interviewType,
        level,
        focus,
        count: plannedQuestionCount,
      });
      newSession.pipeline = {
        provider: "local",
        model: "curated-fallback",
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
