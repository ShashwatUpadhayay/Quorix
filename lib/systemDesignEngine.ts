import {
  ScenarioCard,
  SystemDesignPhase,
  SystemDesignTurn,
  SystemDesignEvaluation,
} from "./mongodb";
import { SceneGraphAnalysis } from "./sceneToGraph";

export interface DetermineMoveResult {
  nextPhase: SystemDesignPhase;
  moveType: "clarification" | "nudge" | "probe" | "challenge" | "advance" | "summary";
  revealedRequirement?: string;
  topicToProbe?: string;
  failureChallenge?: string;
  contextInstruction: string;
}

const PHASES_IN_ORDER: SystemDesignPhase[] = [
  "requirements",
  "estimation",
  "high_level_design",
  "deep_dive",
  "bottlenecks",
  "wrap_up",
];

export function getNextPhase(current: SystemDesignPhase): SystemDesignPhase {
  const idx = PHASES_IN_ORDER.indexOf(current);
  if (idx >= 0 && idx < PHASES_IN_ORDER.length - 1) {
    return PHASES_IN_ORDER[idx + 1];
  }
  return "wrap_up";
}

/**
 * Checks if the candidate's input asks about a hidden requirement
 */
export function checkClarificationMatch(
  candidateText: string,
  scenario: ScenarioCard,
  alreadyRevealed: string[]
): { requirement: string; category: string } | null {
  const text = candidateText.toLowerCase();

  // 1. Check functional requirements
  for (const req of scenario.hiddenRequirements.functional) {
    if (alreadyRevealed.includes(req)) continue;
    const words = req.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const matches = words.filter((w) => text.includes(w));
    if (matches.length >= 2 || (words.length > 0 && text.includes(words[0]))) {
      return { requirement: req, category: "Functional Requirement" };
    }
  }

  // 2. Check non-functional requirements (latency, SLA, consistency, availability)
  for (const req of scenario.hiddenRequirements.nonFunctional) {
    if (alreadyRevealed.includes(req)) continue;
    if (
      (text.includes("latency") && req.toLowerCase().includes("latency")) ||
      (text.includes("sla") && req.toLowerCase().includes("sla")) ||
      (text.includes("availability") && req.toLowerCase().includes("availability")) ||
      (text.includes("consistency") && req.toLowerCase().includes("consistency")) ||
      (text.includes("read") && text.includes("write") && req.toLowerCase().includes("read"))
    ) {
      return { requirement: req, category: "Non-Functional SLA" };
    }
  }

  // 3. Check scale numbers
  const scale = scenario.hiddenRequirements.scale;
  if (
    (text.includes("dau") || text.includes("users") || text.includes("traffic") || text.includes("scale") || text.includes("volume") || text.includes("qps")) &&
    scale.dau &&
    !alreadyRevealed.includes(`Daily Active Users: ${scale.dau}`)
  ) {
    return {
      requirement: `Scale: ${scale.dau}. Peak read throughput: ${scale.readsPerSec || "N/A"}, write throughput: ${scale.writesPerSec || "N/A"}.`,
      category: "Scale & Throughput",
    };
  }

  if (
    (text.includes("storage") || text.includes("retention") || text.includes("capacity")) &&
    scale.storagePerYear &&
    !alreadyRevealed.includes(`Storage: ${scale.storagePerYear}`)
  ) {
    return {
      requirement: `Storage: ${scale.storagePerYear}.`,
      category: "Storage Volume",
    };
  }

  return null;
}

/**
 * Deterministic move decision engine
 */
export function determineInterviewerMove(
  currentPhase: SystemDesignPhase,
  candidateText: string,
  scenario: ScenarioCard,
  turns: SystemDesignTurn[],
  alreadyRevealed: string[],
  graphAnalysis: SceneGraphAnalysis,
  requestedPhase?: SystemDesignPhase
): DetermineMoveResult {
  const text = candidateText.toLowerCase().trim();
  const phaseTurns = turns.filter((t) => t.phase === currentPhase && t.speaker === "candidate");

  // Explicit candidate phase progression request
  if (requestedPhase && requestedPhase !== currentPhase) {
    return {
      nextPhase: requestedPhase,
      moveType: "advance",
      contextInstruction: `Candidate requested transitioning to ${requestedPhase}. Acknowledge and guide them into ${requestedPhase}.`,
    };
  }

  // Check for phase transition keywords
  if (
    (text.includes("move on to estimation") || text.includes("start estimating") || text.includes("back of the envelope")) &&
    currentPhase === "requirements"
  ) {
    return {
      nextPhase: "estimation",
      moveType: "advance",
      contextInstruction: "Candidate is ready to estimate. Prompt them for rough QPS, storage, and bandwidth numbers.",
    };
  }

  if (
    (text.includes("move to high level") || text.includes("draw the architecture") || text.includes("high-level design") || text.includes("start with the diagram")) &&
    (currentPhase === "requirements" || currentPhase === "estimation")
  ) {
    return {
      nextPhase: "high_level_design",
      moveType: "advance",
      contextInstruction: "Candidate is ready to design. Invite them to use the canvas on the right to lay out components and data flow.",
    };
  }

  if (
    (text.includes("ready to deep dive") || text.includes("deep dive into")) &&
    currentPhase === "high_level_design"
  ) {
    return {
      nextPhase: "deep_dive",
      moveType: "advance",
      contextInstruction: "Move into deep dive. Pick an interesting or critical component from their design to push on.",
    };
  }

  if (
    (text.includes("bottlenecks") || text.includes("trade-offs") || text.includes("failure scenarios") || text.includes("what could fail")) &&
    currentPhase === "deep_dive"
  ) {
    return {
      nextPhase: "bottlenecks",
      moveType: "advance",
      contextInstruction: "Transition to bottlenecks. Inject a concrete failure scenario or 10x traffic spike.",
    };
  }

  if (
    (text.includes("wrap up") || text.includes("in summary") || text.includes("to conclude")) &&
    currentPhase === "bottlenecks"
  ) {
    return {
      nextPhase: "wrap_up",
      moveType: "advance",
      contextInstruction: "Candidate is wrapping up. Ask them to summarize their architecture and point out what they'd improve with more time.",
    };
  }

  // --- PHASE-SPECIFIC BEHAVIORS ---

  // 1. REQUIREMENTS PHASE
  if (currentPhase === "requirements") {
    // Check if candidate asked a clarifying question
    const matched = checkClarificationMatch(candidateText, scenario, alreadyRevealed);
    if (matched) {
      return {
        nextPhase: "requirements",
        moveType: "clarification",
        revealedRequirement: matched.requirement,
        contextInstruction: `Answer the candidate's clarifying question directly using this fact: "${matched.requirement}". Do not reveal any other unasked requirements. Keep answer brief (1-2 sentences) and ask what else they need.`,
      };
    }

    if (text.length < 15 && phaseTurns.length > 0) {
      return {
        nextPhase: "requirements",
        moveType: "nudge",
        contextInstruction: "Candidate gave a brief input. Nudge them to clarify functional scope or non-functional constraints before jumping into design.",
      };
    }

    // If candidate has had 2-3 turns in requirements, suggest advancing to estimation
    if (phaseTurns.length >= 2) {
      return {
        nextPhase: "requirements",
        moveType: "probe",
        contextInstruction: "Good coverage of requirements. Ask if they have sufficient constraints to start back-of-the-envelope estimation or high-level architecture.",
      };
    }

    return {
      nextPhase: "requirements",
      moveType: "nudge",
      contextInstruction: "Acknowledge the candidate's question. Answer concisely and invite any remaining questions about scale or constraints.",
    };
  }

  // 2. ESTIMATION PHASE
  if (currentPhase === "estimation") {
    if (text.includes("/s") || text.includes("qps") || text.includes("tb") || text.includes("gb") || text.includes("million")) {
      return {
        nextPhase: "estimation",
        moveType: "probe",
        contextInstruction: "Acknowledge their back-of-envelope numbers. Ask how this calculated scale will influence their choice of database or caching layer, and suggest moving to the high-level design canvas.",
      };
    }

    return {
      nextPhase: "estimation",
      moveType: "nudge",
      contextInstruction: "Ask them to estimate read QPS, write QPS, and roughly how much storage will be needed over 1 year.",
    };
  }

  // 3. HIGH-LEVEL DESIGN PHASE
  if (currentPhase === "high_level_design") {
    // React to what is drawn on the canvas!
    if (graphAnalysis.nodes.length === 0) {
      return {
        nextPhase: "high_level_design",
        moveType: "nudge",
        contextInstruction: "The candidate hasn't placed components on the canvas yet. Prompt them to drag and drop components (Client, Load Balancer, Gateway, Services, DB) from the palette to sketch the primary flow.",
      };
    }

    // If structural flags exist (e.g. client connects directly to DB)
    if (graphAnalysis.structuralFlags.length > 0) {
      const topFlag = graphAnalysis.structuralFlags[0];
      return {
        nextPhase: "high_level_design",
        moveType: "probe",
        contextInstruction: `Notice this structural pattern in their diagram: "${topFlag.message}". Ask them about that specific connection without giving away the fix.`,
      };
    }

    // If missing expected components
    if (graphAnalysis.missingComponents.length > 0 && phaseTurns.length >= 2) {
      const missing = graphAnalysis.missingComponents[0];
      return {
        nextPhase: "high_level_design",
        moveType: "probe",
        contextInstruction: `Their diagram has ${graphAnalysis.nodes.length} nodes. Notice that ${missing} is not yet represented. Probe gently how they plan to handle ${missing.toLowerCase()} at this scale.`,
      };
    }

    return {
      nextPhase: "high_level_design",
      moveType: "probe",
      topicToProbe: "Data flow & APIs",
      contextInstruction: "Acknowledge the components drawn. Ask them to trace a single request from client through the system, and what the key API endpoints and payloads look like.",
    };
  }

  // 4. DEEP DIVE PHASE
  if (currentPhase === "deep_dive") {
    // Pick an unprobed deep dive topic from the scenario card
    const deepDive = scenario.deepDiveTopics[0];
    return {
      nextPhase: "deep_dive",
      moveType: "probe",
      topicToProbe: deepDive?.topic,
      contextInstruction: `Deep dive into: "${deepDive?.topic}". Ask this question: "${deepDive?.probeQuestion}". Keep your response focused on this single technical trade-off.`,
    };
  }

  // 5. BOTTLENECKS & FAILURE SCENARIOS
  if (currentPhase === "bottlenecks") {
    const failure = scenario.failureScenarios[0];
    return {
      nextPhase: "bottlenecks",
      moveType: "challenge",
      failureChallenge: failure?.challenge,
      contextInstruction: `Inject this failure scenario: "${failure?.challenge}". Push the candidate to explain what happens to inflight requests and how the system recovers.`,
    };
  }

  // 6. WRAP UP PHASE
  return {
    nextPhase: "wrap_up",
    moveType: "summary",
    contextInstruction: "Thank the candidate for the walkthrough. Ask them for their 1-minute summary: what are the key trade-offs they made, and what would they monitor or refine next?",
  };
}

/**
 * Builds the tailored system prompt for the AI interviewer
 */
export function buildInterviewerPrompt(
  scenario: ScenarioCard,
  currentPhase: SystemDesignPhase,
  alreadyRevealed: string[],
  graphAnalysis: SceneGraphAnalysis,
  decision: DetermineMoveResult,
  candidateNotes?: string
): string {
  return `You are a Senior Principal Software Architect conducting an interactive System Design interview.

SCENARIO TITLE: ${scenario.title}
DIFFICULTY LEVEL: ${scenario.difficulty}
CURRENT PHASE: ${currentPhase.toUpperCase()}
MOVE FOR THIS TURN: ${decision.moveType.toUpperCase()}

SCENARIO BRIEF:
"${scenario.brief}"

SECRET INTERVIEWER KNOWLEDGE (DO NOT VOLUNTEER UNASKED):
- Scale: ${JSON.stringify(scenario.hiddenRequirements.scale)}
- Non-functional SLA: ${scenario.hiddenRequirements.nonFunctional.join("; ")}
- Functional requirements: ${scenario.hiddenRequirements.functional.join("; ")}
- Hidden constraints: ${scenario.hiddenRequirements.hiddenConstraints.join("; ")}
- Already revealed to candidate: [${alreadyRevealed.join(" | ") || "None yet"}]

CANDIDATE'S DIAGRAM ON CANVAS (REAL-TIME GRAPH PARSER):
${graphAnalysis.readableTextSummary}

CANDIDATE SCRATCHPAD NOTES:
${candidateNotes || "None"}

INSTRUCTIONS FOR THIS TURN:
${decision.contextInstruction}

STRICT INTERVIEWER RULES:
1. Speak concisely in 2 to 4 sentences maximum.
2. Ask exactly ONE clear question or challenge at a time.
3. NEVER volunteer the solution or praise vaguely (no "Awesome design!").
4. React specifically to the components and flows they have drawn or written.
5. Keep candidate in the driver's seat. Probe their choices, trade-offs, and edge cases.`;
}

/**
 * Generates phase-based evaluation score across all 7 dimensions
 */
export function generateSystemDesignEvaluation(
  scenario: ScenarioCard,
  turns: SystemDesignTurn[],
  graphAnalysis: SceneGraphAnalysis,
  revealedRequirements: string[]
): SystemDesignEvaluation {
  const candidateTurns = turns.filter((t) => t.speaker === "candidate");
  const totalCandidateWords = candidateTurns.reduce((sum, t) => sum + t.message.split(/\s+/).length, 0);

  // 1. Requirements gathering score
  const reqCount = revealedRequirements.length;
  const reqScore = Math.min(10, Math.max(3, reqCount * 3 + 2));
  const reqFeedback =
    reqCount >= 3
      ? "Strong proactive requirements probing: clarified scale, throughput, and functional boundaries before designing."
      : "Rushed into design without clarifying non-functional constraints, latency SLAs, or read/write ratios.";

  // 2. Estimation score
  const hasNumbers = candidateTurns.some((t) =>
    /\b(qps|tps|gb|tb|pb|million|thousand|\/sec)\b/i.test(t.message)
  );
  const estScore = hasNumbers ? 8.5 : 5.0;
  const estFeedback = hasNumbers
    ? "Good back-of-the-envelope calculations grounding architecture in actual storage and throughput capacity."
    : "Lacked concrete numerical estimates for storage growth and peak QPS.";

  // 3. Architecture & Coverage score
  const coveragePct = graphAnalysis.coveragePercentage;
  const archScore = Math.min(10, Math.max(4, Math.round((coveragePct / 100) * 8 + 2)));
  const archFeedback = `Diagram incorporated ${graphAnalysis.coveredComponents.length} of ${scenario.expectedComponents.length} expected components (${coveragePct}%). Data flow was ${graphAnalysis.edges.length > 0 ? "clearly directed" : "missing arrow connections"}.`;

  // 4. Data & API design score
  const apiTurns = candidateTurns.filter((t) =>
    /\b(api|endpoint|post|get|put|schema|table|id|key|json)\b/i.test(t.message)
  );
  const apiScore = apiTurns.length >= 2 ? 8.0 : 6.0;
  const apiFeedback =
    apiTurns.length >= 2
      ? "Solid API contract and storage schema considerations articulated."
      : "Could have provided more explicit API request/response contracts and data schemas.";

  // 5. Depth and Trade-offs score
  const tradeoffTurns = candidateTurns.filter((t) =>
    /\b(tradeoff|trade-off|vs|versus|because|however|instead|latency|cost)\b/i.test(t.message)
  );
  const depthScore = Math.min(10, Math.max(4, tradeoffTurns.length * 2 + 4));
  const depthFeedback =
    tradeoffTurns.length >= 2
      ? "Demonstrated mature architectural reasoning: compared alternatives rather than blindly picking tools."
      : "Needs deeper justification of technology choices and explicit trade-off analysis.";

  // 6. Reliability and Scale score
  const bottleneckTurns = turns.filter((t) => t.phase === "bottlenecks" && t.speaker === "candidate");
  const relScore = bottleneckTurns.length >= 1 ? 8.5 : 6.0;
  const relFeedback =
    bottleneckTurns.length >= 1
      ? "Addressed single points of failure, redundancy, and performance under 10x burst traffic."
      : "Overlooked node failure recovery and resilience under extreme traffic spikes.";

  // 7. Communication & Clarity score
  const commScore = totalCandidateWords > 150 ? 8.8 : 6.5;
  const commFeedback =
    totalCandidateWords > 150
      ? "Structured, collaborative, and clear communication throughout the interview session."
      : "Responses were somewhat brief; drive the session more proactively.";

  const overall = Math.round(
    ((reqScore + estScore + archScore + apiScore + depthScore + relScore + commScore) / 7) * 10
  ) / 10;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (reqScore >= 8) strengths.push("Thorough requirements gathering");
  else weaknesses.push("Ask more clarifying questions upfront");

  if (archScore >= 8) strengths.push("Comprehensive component coverage on whiteboard");
  else weaknesses.push("Include missing architectural primitives (e.g. " + (graphAnalysis.missingComponents[0] || "queues") + ")");

  if (depthScore >= 8) strengths.push("Articulated strong architectural trade-offs");
  else weaknesses.push("Explain *why* a particular technology is chosen over alternatives");

  if (relScore >= 8) strengths.push("Resilient failure handling and bottleneck planning");

  return {
    overallScore: overall,
    dimensions: {
      requirementsGathering: { score: reqScore, feedback: reqFeedback },
      estimation: { score: estScore, feedback: estFeedback },
      architecture: { score: archScore, feedback: archFeedback },
      dataAndApiDesign: { score: apiScore, feedback: apiFeedback },
      depthAndTradeoffs: { score: depthScore, feedback: depthFeedback },
      reliabilityAndScale: { score: relScore, feedback: relFeedback },
      communicationAndClarity: { score: commScore, feedback: commFeedback },
    },
    coveredComponents: graphAnalysis.coveredComponents,
    missedComponents: graphAnalysis.missingComponents,
    strengths,
    weaknesses,
    summaryFeedback: `Candidate achieved an overall score of ${overall}/10 for ${scenario.title}. The design demonstrated solid architectural intuition with ${graphAnalysis.nodes.length} diagram components and ${reqCount} requirements identified. Focus on explicit trade-offs and numerical estimation for higher seniority tiers.`,
  };
}
