import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getSystemDesignSessionsCollection,
  SystemDesignTurn,
  SystemDesignPhase,
} from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { parseSceneToGraph } from "@/lib/sceneToGraph";
import {
  determineInterviewerMove,
  buildInterviewerPrompt,
  DetermineMoveResult,
} from "@/lib/systemDesignEngine";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Calls Gemini if configured, otherwise falls back to smart contextual response
 */
async function callLlmForInterviewerTurn(
  systemPrompt: string,
  candidateMessage: string,
  decision: DetermineMoveResult
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
      const baseUrl =
        process.env.GEMINI_API_BASE_URL ||
        "https://generativelanguage.googleapis.com/v1beta";
      const url = `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${systemPrompt}\n\nCandidate's latest input:\n"${candidateMessage}"\n\nProvide the interviewer's next response following the rules:`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 250,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text =
          data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          return text;
        }
      }
    } catch (err) {
      console.warn("[System Design Turn] Gemini API call skipped/failed:", err);
    }
  }

  // High-fidelity fallback based on the deterministic move decision
  if (decision.moveType === "clarification" && decision.revealedRequirement) {
    return `To clarify your question: ${decision.revealedRequirement} What other assumptions or scope parameters would you like to establish before moving forward?`;
  }

  if (decision.moveType === "advance" && decision.nextPhase === "estimation") {
    return `That gives us a clear scope. Let's do some quick back-of-the-envelope calculations. What do you estimate for daily active users, peak read/write QPS, and 1-year storage capacity?`;
  }

  if (decision.moveType === "advance" && decision.nextPhase === "high_level_design") {
    return `Those numbers set the right scale targets. Let's move to the whiteboard on your right. Start sketching your core components—clients, gateways, services, and storage—and trace how a request moves through the system.`;
  }

  if (decision.moveType === "advance" && decision.nextPhase === "deep_dive") {
    return `Your high-level flow is established. Let's zoom in on a couple of critical components. How are you handling data partitioning and caching under peak load?`;
  }

  if (decision.moveType === "advance" && decision.nextPhase === "bottlenecks") {
    return `Now let's stress test this architecture. What is the single biggest bottleneck in this design, and how does your system react if traffic spikes 10x or a primary database replica crashes?`;
  }

  if (decision.moveType === "advance" && decision.nextPhase === "wrap_up") {
    return `We're near the end of our time. Could you give a 1-minute executive summary of your architecture, highlighting the main trade-offs you chose and what you'd optimize if you had another month?`;
  }

  if (decision.failureChallenge) {
    return `Consider this failure scenario: ${decision.failureChallenge} How does your architecture handle this without losing transactions or dropping connections?`;
  }

  if (decision.topicToProbe) {
    return `Looking at that design: how are you addressing ${decision.topicToProbe}? Walk me through the trade-offs between your chosen approach and the alternatives.`;
  }

  return `That makes sense. Can you explain the data flow and how your components interact to ensure both low latency and high availability?`;
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
      message = "",
      diagramJson = "",
      candidateNotes = "",
      requestedPhase,
    } = body as {
      message?: string;
      diagramJson?: string;
      candidateNotes?: string;
      requestedPhase?: SystemDesignPhase;
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

    // 1. Parse current whiteboard diagram into semantic graph
    const graphAnalysis = parseSceneToGraph(
      diagramJson || session.currentDiagramJson || "[]",
      session.scenario.expectedComponents
    );

    // 2. Run deterministic move engine
    const decision = determineInterviewerMove(
      session.currentPhase,
      message,
      session.scenario,
      session.turns,
      session.revealedRequirements,
      graphAnalysis,
      requestedPhase
    );

    // 3. Build system prompt & generate AI response
    const systemPrompt = buildInterviewerPrompt(
      session.scenario,
      decision.nextPhase,
      session.revealedRequirements,
      graphAnalysis,
      decision,
      candidateNotes || session.candidateNotes
    );

    const interviewerText = await callLlmForInterviewerTurn(
      systemPrompt,
      message,
      decision
    );

    const now = new Date();
    const candidateTurn: SystemDesignTurn = {
      id: `turn_${now.getTime()}_c`,
      speaker: "candidate",
      phase: session.currentPhase,
      message: message.trim(),
      timestamp: now,
    };

    const interviewerTurn: SystemDesignTurn = {
      id: `turn_${now.getTime() + 1}_i`,
      speaker: "interviewer",
      phase: decision.nextPhase,
      message: interviewerText,
      moveType: decision.moveType,
      revealedRequirement: decision.revealedRequirement,
      timestamp: new Date(now.getTime() + 50),
    };

    const updatedRevealed = [...session.revealedRequirements];
    if (decision.revealedRequirement && !updatedRevealed.includes(decision.revealedRequirement)) {
      updatedRevealed.push(decision.revealedRequirement);
    }

    const updatedTurns = [...session.turns, candidateTurn, interviewerTurn];

    await collection.updateOne(query, {
      $set: {
        currentPhase: decision.nextPhase,
        revealedRequirements: updatedRevealed,
        coveredComponents: graphAnalysis.coveredComponents,
        currentGraphSummary: graphAnalysis.readableTextSummary,
        currentDiagramJson: diagramJson || session.currentDiagramJson,
        candidateNotes: candidateNotes ?? session.candidateNotes,
        turns: updatedTurns,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      phase: decision.nextPhase,
      moveType: decision.moveType,
      interviewerMessage: interviewerText,
      revealedRequirement: decision.revealedRequirement,
      graphAnalysis: {
        nodesCount: graphAnalysis.nodes.length,
        edgesCount: graphAnalysis.edges.length,
        coveragePercentage: graphAnalysis.coveragePercentage,
        coveredComponents: graphAnalysis.coveredComponents,
        missingComponents: graphAnalysis.missingComponents,
        structuralFlags: graphAnalysis.structuralFlags,
        readableTextSummary: graphAnalysis.readableTextSummary,
      },
    });
  } catch (error: unknown) {
    console.error("[POST /api/mock/system-design/[id]/turn] error:", error);
    return NextResponse.json(
      { error: "Failed to process interview turn" },
      { status: 500 }
    );
  }
}
