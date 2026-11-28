import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getSystemDesignSessionsCollection,
} from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { parseSceneToGraph } from "@/lib/sceneToGraph";
import { generateSystemDesignEvaluation } from "@/lib/systemDesignEngine";
import { recordUserActivity } from "@/lib/activity";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { diagramJson, candidateNotes } = body as {
      diagramJson?: string;
      candidateNotes?: string;
    };

    const collection = await getSystemDesignSessionsCollection();
    let query: Record<string, unknown> = { _id: id };
    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) as unknown as string }, { _id: id }] };
    }

    const session = await collection.findOne(query);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.userId !== user._id.toString()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const effectiveDiagram = diagramJson || session.currentDiagramJson || "[]";
    const graphAnalysis = parseSceneToGraph(
      effectiveDiagram,
      session.scenario.expectedComponents
    );

    const evaluation = generateSystemDesignEvaluation(
      session.scenario,
      session.turns,
      graphAnalysis,
      session.revealedRequirements
    );

    const completedAt = new Date();

    await collection.updateOne(query, {
      $set: {
        status: "completed",
        currentPhase: "wrap_up",
        evaluation,
        currentDiagramJson: effectiveDiagram,
        currentGraphSummary: graphAnalysis.readableTextSummary,
        coveredComponents: graphAnalysis.coveredComponents,
        candidateNotes: candidateNotes ?? session.candidateNotes,
        completedAt,
        updatedAt: completedAt,
      },
    });

    await recordUserActivity({
      userId: user._id.toString(),
      action: "Completed System Design Interview",
      category: "interview",
      detail: `${session.scenarioTitle} · Score: ${evaluation.overallScore}/10 (${graphAnalysis.coveredComponents.length} components covered)`,
    });

    return NextResponse.json({
      success: true,
      evaluation,
      graphAnalysis,
      completedAt,
    });
  } catch (error: unknown) {
    console.error("[POST /api/mock/system-design/[id]/evaluate] error:", error);
    return NextResponse.json(
      { error: "Failed to evaluate session" },
      { status: 500 }
    );
  }
}
