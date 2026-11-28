/**
 * Excalidraw Scene-to-Graph Parser and Architectural Analyzer
 * Converts raw Excalidraw JSON into a semantic directed graph with
 * structural anti-pattern detection and component coverage analysis.
 */

export interface RawExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  originalText?: string;
  isDeleted?: boolean;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  boundElements?: Array<{ id: string; type: string }> | null;
  containerId?: string | null;
}

export interface GraphNode {
  id: string;
  label: string;
  canonicalType: string; // e.g. "Database", "Cache", "Load Balancer", "Service", "Queue", "Client", "CDN", "Storage"
  x: number;
  y: number;
}

export interface GraphEdge {
  fromNodeId: string;
  toNodeId: string;
  fromLabel: string;
  toLabel: string;
  edgeType?: string;
}

export interface StructuralFlag {
  type: "warning" | "caution" | "insight";
  code: string;
  message: string;
}

export interface SceneGraphAnalysis {
  nodes: GraphNode[];
  edges: GraphEdge[];
  flowSummary: string[];
  readableTextSummary: string;
  coveredComponents: string[];
  missingComponents: string[];
  coveragePercentage: number;
  structuralFlags: StructuralFlag[];
}

// Canonical component aliases
const COMPONENT_ALIASES: Record<string, string[]> = {
  "Client": ["client", "user", "browser", "mobile", "app", "frontend", "ios", "android", "web", "customer"],
  "CDN": ["cdn", "cloudflare", "cloudfront", "akamai", "fastly", "edge", "edge cache"],
  "Load Balancer": ["load balancer", "lb", "alb", "nlb", "haproxy", "nginx", "proxy", "reverse proxy", "traffic manager"],
  "API Gateway": ["api gateway", "gateway", "kong", "envoy", "apigw", "ingress", "zuul", "traefik"],
  "Service": ["service", "app server", "backend", "api", "microservice", "web server", "server", "controller", "handler"],
  "Cache": ["cache", "redis", "memcached", "hazelcast", "in-memory", "valkey", "local cache"],
  "Database": ["database", "db", "postgres", "postgresql", "mysql", "mongodb", "cassandra", "dynamodb", "aurora", "sql", "nosql", "scylladb", "cockroachdb", "spanner"],
  "Queue": ["queue", "kafka", "rabbitmq", "sqs", "pubsub", "message queue", "broker", "event bus", "redpanda", "pulsar", "nats"],
  "Worker": ["worker", "consumer", "processor", "background job", "task runner", "celery", "flink"],
  "Storage": ["s3", "storage", "blob", "gcs", "file store", "object storage", "hdfs", "nfs", "bucket"],
};

/**
 * Classifies a user's text label into a canonical architecture category
 */
export function classifyComponentLabel(rawText: string): string {
  const normalized = rawText.toLowerCase().trim();

  for (const [canonical, aliases] of Object.entries(COMPONENT_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return canonical;
    }
  }

  // Fallback heuristic based on common keywords
  if (normalized.includes("auth") || normalized.includes("user") || normalized.includes("order") || normalized.includes("payment")) {
    return "Service";
  }

  return "Component";
}

/**
 * Parses raw Excalidraw JSON or element array into a semantic graph
 */
export function parseSceneToGraph(
  sceneInput: string | RawExcalidrawElement[] | { elements?: RawExcalidrawElement[] },
  expectedComponents: string[] = []
): SceneGraphAnalysis {
  let elements: RawExcalidrawElement[] = [];

  if (typeof sceneInput === "string") {
    try {
      const parsed = JSON.parse(sceneInput);
      elements = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.elements)
        ? parsed.elements
        : [];
    } catch {
      elements = [];
    }
  } else if (Array.isArray(sceneInput)) {
    elements = sceneInput;
  } else if (sceneInput && Array.isArray(sceneInput.elements)) {
    elements = sceneInput.elements;
  }

  // Filter active, non-deleted elements
  const activeElements = elements.filter((el) => !el.isDeleted);

  // Separate shapes, text, and arrows
  const textMap = new Map<string, string>();
  activeElements
    .filter((el) => el.type === "text" && (el.text || el.originalText))
    .forEach((el) => {
      textMap.set(el.id, (el.text || el.originalText || "").trim());
    });

  const nodeMap = new Map<string, GraphNode>();
  const shapeElements = activeElements.filter((el) =>
    ["rectangle", "ellipse", "diamond", "roundRectangle"].includes(el.type)
  );

  // 1. Extract Nodes from Shapes with bound or nearby text
  shapeElements.forEach((shape) => {
    let label = "";

    // Check bound elements
    if (shape.boundElements) {
      for (const bound of shape.boundElements) {
        if (bound.type === "text" && textMap.has(bound.id)) {
          label = textMap.get(bound.id) || "";
          break;
        }
      }
    }

    // If no bound text, search for text located inside or right below shape bounding box
    if (!label) {
      const sx = shape.x;
      const sy = shape.y;
      const sw = shape.width || 120;
      const sh = shape.height || 60;

      for (const [textId, tText] of textMap.entries()) {
        const textEl = activeElements.find((e) => e.id === textId);
        if (textEl) {
          const tx = textEl.x;
          const ty = textEl.y;
          // Within bounding box or near bottom
          if (tx >= sx - 20 && tx <= sx + sw + 20 && ty >= sy - 15 && ty <= sy + sh + 30) {
            label = tText;
            break;
          }
        }
      }
    }

    if (!label) {
      label = shape.type === "ellipse" ? "Database/Storage" : "Component";
    }

    const canonicalType = classifyComponentLabel(label);

    nodeMap.set(shape.id, {
      id: shape.id,
      label,
      canonicalType,
      x: shape.x,
      y: shape.y,
    });
  });

  // 2. Also register standalone text blocks as nodes if they are not attached to shapes
  const boundTextIds = new Set(
    shapeElements.flatMap((s) => (s.boundElements || []).map((b) => b.id))
  );

  activeElements
    .filter((el) => el.type === "text" && !boundTextIds.has(el.id))
    .forEach((textEl) => {
      const text = (textEl.text || textEl.originalText || "").trim();
      // Only keep architectural keywords or multi-char identifiers
      if (text.length > 2 && !nodeMap.has(textEl.id)) {
        // If it isn't already inside another shape
        const isInsideShape = shapeElements.some((s) => {
          const sx = s.x;
          const sy = s.y;
          const sw = s.width || 120;
          const sh = s.height || 60;
          return textEl.x >= sx && textEl.x <= sx + sw && textEl.y >= sy && textEl.y <= sy + sh;
        });

        if (!isInsideShape) {
          nodeMap.set(textEl.id, {
            id: textEl.id,
            label: text,
            canonicalType: classifyComponentLabel(text),
            x: textEl.x,
            y: textEl.y,
          });
        }
      }
    });

  // 3. Extract Directed Edges from Arrows
  const edges: GraphEdge[] = [];
  const arrowElements = activeElements.filter((el) => el.type === "arrow" || el.type === "line");

  arrowElements.forEach((arrow) => {
    let fromNodeId = arrow.startBinding?.elementId;
    let toNodeId = arrow.endBinding?.elementId;

    // Spatial proximity fallback if bindings were not generated by Excalidraw
    if (!fromNodeId || !toNodeId) {
      const ax = arrow.x;
      const ay = arrow.y;
      const nodesArr = Array.from(nodeMap.values());

      if (!fromNodeId && nodesArr.length > 0) {
        const closestStart = nodesArr.find((n) => Math.hypot(n.x - ax, n.y - ay) < 140);
        if (closestStart) fromNodeId = closestStart.id;
      }

      if (!toNodeId && nodesArr.length > 0) {
        const endX = arrow.x + (arrow.width || 100);
        const endY = arrow.y + (arrow.height || 50);
        const closestEnd = nodesArr.find((n) => Math.hypot(n.x - endX, n.y - endY) < 140 && n.id !== fromNodeId);
        if (closestEnd) toNodeId = closestEnd.id;
      }
    }

    if (fromNodeId && toNodeId && nodeMap.has(fromNodeId) && nodeMap.has(toNodeId)) {
      const fromNode = nodeMap.get(fromNodeId)!;
      const toNode = nodeMap.get(toNodeId)!;

      // Avoid duplicates
      const exists = edges.some((e) => e.fromNodeId === fromNodeId && e.toNodeId === toNodeId);
      if (!exists) {
        edges.push({
          fromNodeId,
          toNodeId,
          fromLabel: fromNode.label,
          toLabel: toNode.label,
        });
      }
    }
  });

  const nodes = Array.from(nodeMap.values());

  // 4. Generate Data Flow Chains
  const flowSummary: string[] = [];
  edges.forEach((edge) => {
    flowSummary.push(`${edge.fromLabel} → ${edge.toLabel}`);
  });

  // 5. Component Coverage Analysis against expectedComponents
  const coveredSet = new Set<string>();
  const detectedTypes = new Set(nodes.map((n) => n.canonicalType));
  const detectedLabels = nodes.map((n) => n.label.toLowerCase());

  expectedComponents.forEach((expected) => {
    const norm = expected.toLowerCase().trim();
    // Check canonical type or label match
    if (detectedTypes.has(expected)) {
      coveredSet.add(expected);
    } else if (detectedLabels.some((l) => l.includes(norm) || norm.includes(l))) {
      coveredSet.add(expected);
    } else {
      // Check alias expansion
      const aliases = COMPONENT_ALIASES[expected] || [];
      if (aliases.some((alias) => detectedLabels.some((l) => l.includes(alias)))) {
        coveredSet.add(expected);
      }
    }
  });

  const coveredComponents = Array.from(coveredSet);
  const missingComponents = expectedComponents.filter((comp) => !coveredSet.has(comp));
  const coveragePercentage =
    expectedComponents.length > 0
      ? Math.round((coveredComponents.length / expectedComponents.length) * 100)
      : nodes.length > 0
      ? 100
      : 0;

  // 6. Structural Anti-Pattern Analysis
  const structuralFlags: StructuralFlag[] = [];

  // Check for disconnected nodes (if at least 2 nodes exist)
  if (nodes.length >= 3) {
    const connectedNodeIds = new Set<string>();
    edges.forEach((e) => {
      connectedNodeIds.add(e.fromNodeId);
      connectedNodeIds.add(e.toNodeId);
    });

    const disconnected = nodes.filter((n) => !connectedNodeIds.has(n.id));
    if (disconnected.length > 0) {
      structuralFlags.push({
        type: "warning",
        code: "DISCONNECTED_NODES",
        message: `Isolated component(s) without data flow connections: ${disconnected
          .map((n) => `"${n.label}"`)
          .join(", ")}. Connect them with arrows to clarify data flow.`,
      });
    }
  }

  // Check for missing Load Balancer / Gateway when Client connects directly to internal services
  const clientNodes = nodes.filter((n) => n.canonicalType === "Client");
  clientNodes.forEach((client) => {
    const outgoingTo = edges
      .filter((e) => e.fromNodeId === client.id)
      .map((e) => nodeMap.get(e.toNodeId));

    const directsToDatabase = outgoingTo.some((n) => n?.canonicalType === "Database");
    if (directsToDatabase) {
      structuralFlags.push({
        type: "warning",
        code: "CLIENT_TO_DB_DIRECT",
        message: "Security anti-pattern: Client connects directly to Database without an API gateway or backend service.",
      });
    }

    const directsToAppWithoutLB = outgoingTo.some(
      (n) => n?.canonicalType === "Service" && !nodes.some((other) => other.canonicalType === "Load Balancer" || other.canonicalType === "API Gateway" || other.canonicalType === "CDN")
    );
    if (directsToAppWithoutLB) {
      structuralFlags.push({
        type: "caution",
        code: "MISSING_GATEWAY_OR_LB",
        message: "Clients connect directly to service without a Load Balancer or API Gateway in front.",
      });
    }
  });

  // Check for Single Point of Failure Database (only 1 DB node, no replication, no cache in high scale)
  const dbNodes = nodes.filter((n) => n.canonicalType === "Database");
  const cacheNodes = nodes.filter((n) => n.canonicalType === "Cache");

  if (dbNodes.length === 1 && cacheNodes.length === 0 && nodes.length >= 4) {
    structuralFlags.push({
      type: "insight",
      code: "NO_CACHE_LAYER",
      message: "Database queries are un-cached. Introducing an in-memory cache (e.g. Redis) would protect DB throughput.",
    });
  }

  // 7. Compose Human and LLM-Readable Summary
  const nodeSummaryStr =
    nodes.length > 0
      ? nodes.map((n) => `${n.label} (${n.canonicalType})`).join(", ")
      : "No architectural components drawn yet";

  const flowSummaryStr =
    flowSummary.length > 0 ? flowSummary.join(" | ") : "No connected directional arrows drawn yet";

  const flagsSummaryStr =
    structuralFlags.length > 0
      ? structuralFlags.map((f) => `[${f.code}] ${f.message}`).join("\n")
      : "No structural anti-patterns detected";

  const readableTextSummary = [
    `Diagram Components (${nodes.length}): ${nodeSummaryStr}`,
    `Data Flows (${edges.length}): ${flowSummaryStr}`,
    `Expected Coverage: ${coveredComponents.length}/${expectedComponents.length} (${coveragePercentage}%)`,
    missingComponents.length > 0 ? `Uncovered Expected Components: ${missingComponents.join(", ")}` : "All core expected components present.",
    `Structural Insights:\n${flagsSummaryStr}`,
  ].join("\n");

  return {
    nodes,
    edges,
    flowSummary,
    readableTextSummary,
    coveredComponents,
    missingComponents,
    coveragePercentage,
    structuralFlags,
  };
}
