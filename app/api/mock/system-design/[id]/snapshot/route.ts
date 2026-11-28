import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getSystemDesignSessionsCollection,
  SystemDesignSnapshot,
  SystemDesignPhase,
} from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { parseSceneToGraph } from "@/lib/sceneToGraph";

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
    const {
      diagramJson = "",
      candidateNotes = "",
      phase,
    } = body as {
      diagramJson?: string;
      candidateNotes?: string;
      phase?: SystemDesignPhase;
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

    const currentPhase = phase || session.currentPhase;
    const graphAnalysis = parseSceneToGraph(
      diagramJson || "[]",
      session.scenario.expectedComponents
    );

    const snapshot: SystemDesignSnapshot = {
      phase: currentPhase,
      timestamp: new Date(),
      elementsCount: graphAnalysis.nodes.length,
      graphSummary: graphAnalysis.readableTextSummary,
      diagramJson: diagramJson || undefined,
    };

    await collection.updateOne(query, {
      $set: {
        currentDiagramJson: diagramJson || session.currentDiagramJson,
        candidateNotes: candidateNotes ?? session.candidateNotes,
        currentGraphSummary: graphAnalysis.readableTextSummary,
        coveredComponents: graphAnalysis.coveredComponents,
        updatedAt: new Date(),
      },
      $push: {
        snapshots: snapshot,
      },
    });

    return NextResponse.json({
      success: true,
      timestamp: snapshot.timestamp,
      elementsCount: snapshot.elementsCount,
      coveredComponents: graphAnalysis.coveredComponents,
    });
  } catch (error: unknown) {
    console.error("[POST /api/mock/system-design/[id]/snapshot] error:", error);
    return NextResponse.json(
      { error: "Failed to save snapshot" },
      { status: 500 }
    );
  }
}
