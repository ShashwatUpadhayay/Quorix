import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getSystemDesignSessionsCollection,
  getDatabase,
  SystemDesignSessionDoc,
  DifficultyTier,
} from "@/lib/mongodb";
import { selectScenarioForCandidate, getScenarioById } from "@/lib/systemDesignScenarios";
import { recordUserActivity } from "@/lib/activity";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user._id.toString();
    const body = await req.json().catch(() => ({}));

    const level: DifficultyTier =
      body.level && ["Foundational", "Intermediate", "Senior", "Staff"].includes(body.level)
        ? body.level
        : "Intermediate";

    const focus: string = body.focus || "Distributed Systems";
    const durationMinutes = Number(body.durationMinutes) || 35;

    // Retrieve candidate profile skills and tags for tailoring
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

    // Select or use specific scenario card
    const scenario = body.scenarioId
      ? getScenarioById(body.scenarioId) || selectScenarioForCandidate(candidateTags, level, focus)
      : selectScenarioForCandidate(candidateTags, level, focus);

    const openingMessage = `Welcome to your System Design interview for **${scenario.title}**.

Here is your scenario:
> "${scenario.brief}"

Take a moment to digest this. We have about ${durationMinutes} minutes. You are driving the session.
To start, what questions do you have about the functional scope or non-functional scale and constraints?`;

    const newSession: Omit<SystemDesignSessionDoc, "_id"> = {
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

    const collection = await getSystemDesignSessionsCollection();
    const result = await collection.insertOne(newSession as SystemDesignSessionDoc);
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
        ...newSession,
        _id: sessionId,
      },
    });
  } catch (error: unknown) {
    console.error("[POST /api/mock/system-design/start] error:", error);
    return NextResponse.json(
      { error: "Failed to initialize System Design session" },
      { status: 500 }
    );
  }
}
