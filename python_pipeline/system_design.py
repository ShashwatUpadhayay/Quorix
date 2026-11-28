"""
System Design Interview Pipeline & State Machine in Python.
Handles Excalidraw scene-to-graph parsing, component classification,
deterministic legal move selection, and interview turn generation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


COMPONENT_ALIASES: Dict[str, List[str]] = {
    "Client": ["client", "user", "browser", "mobile", "app", "frontend", "ios", "android", "web"],
    "CDN": ["cdn", "cloudflare", "cloudfront", "akamai", "fastly", "edge"],
    "Load Balancer": ["load balancer", "lb", "alb", "nlb", "haproxy", "nginx", "proxy", "reverse proxy"],
    "API Gateway": ["api gateway", "gateway", "kong", "envoy", "apigw", "ingress", "traefik"],
    "Service": ["service", "app server", "backend", "api", "microservice", "web server"],
    "Cache": ["cache", "redis", "memcached", "hazelcast", "in-memory", "valkey"],
    "Database": ["database", "db", "postgres", "postgresql", "mysql", "mongodb", "cassandra", "dynamodb", "aurora", "sql", "nosql"],
    "Queue": ["queue", "kafka", "rabbitmq", "sqs", "pubsub", "message queue", "broker", "event bus"],
    "Worker": ["worker", "consumer", "processor", "background job", "task runner"],
    "Storage": ["s3", "storage", "blob", "gcs", "file store", "object storage"],
}


def classify_component_label(raw_text: str) -> str:
    norm = raw_text.lower().strip()
    for canonical, aliases in COMPONENT_ALIASES.items():
        if any(alias in norm for alias in aliases):
            return canonical
    return "Component"


@dataclass
class GraphNode:
    id: str
    label: str
    canonical_type: str
    x: float
    y: float


@dataclass
class GraphEdge:
    from_node_id: str
    to_node_id: str
    from_label: str
    to_label: str


@dataclass
class SceneGraphResult:
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    flows: List[str]
    covered_components: List[str]
    missing_components: List[str]
    coverage_percentage: int
    readable_summary: str


def parse_scene_to_graph(scene_data: Any, expected_components: Optional[List[str]] = None) -> SceneGraphResult:
    if expected_components is None:
        expected_components = []

    if isinstance(scene_data, str):
        try:
            parsed = json.loads(scene_data)
            elements = parsed if isinstance(parsed, list) else parsed.get("elements", [])
        except Exception:
            elements = []
    elif isinstance(scene_data, list):
        elements = scene_data
    elif isinstance(scene_data, dict):
        elements = scene_data.get("elements", [])
    else:
        elements = []

    active = [el for el in elements if not el.get("isDeleted", False)]

    text_map: Dict[str, str] = {}
    for el in active:
        if el.get("type") == "text":
            text = (el.get("text") or el.get("originalText") or "").strip()
            if text:
                text_map[el.get("id")] = text

    nodes: Dict[str, GraphNode] = {}
    shapes = [el for el in active if el.get("type") in ("rectangle", "ellipse", "diamond", "roundRectangle")]

    for s in shapes:
        label = ""
        bound = s.get("boundElements") or []
        for b in bound:
            bid = b.get("id")
            if bid in text_map:
                label = text_map[bid]
                break

        if not label:
            label = "Database" if s.get("type") == "ellipse" else "Component"

        nodes[s["id"]] = GraphNode(
            id=s["id"],
            label=label,
            canonical_type=classify_component_label(label),
            x=float(s.get("x", 0)),
            y=float(s.get("y", 0)),
        )

    # Standalone text elements
    for el in active:
        if el.get("type") == "text" and el.get("id") not in nodes:
            txt = (el.get("text") or el.get("originalText") or "").strip()
            if len(txt) > 2:
                nodes[el["id"]] = GraphNode(
                    id=el["id"],
                    label=txt,
                    canonical_type=classify_component_label(txt),
                    x=float(el.get("x", 0)),
                    y=float(el.get("y", 0)),
                )

    edges: List[GraphEdge] = []
    arrows = [el for el in active if el.get("type") in ("arrow", "line")]
    for a in arrows:
        start_id = a.get("startBinding", {}).get("elementId") if a.get("startBinding") else None
        end_id = a.get("endBinding", {}).get("elementId") if a.get("endBinding") else None

        if start_id in nodes and end_id in nodes:
            fn = nodes[start_id]
            tn = nodes[end_id]
            edges.append(GraphEdge(from_node_id=start_id, to_node_id=end_id, from_label=fn.label, to_label=tn.label))

    flows = [f"{e.from_label} -> {e.to_label}" for e in edges]

    node_list = list(nodes.values())
    detected_types = {n.canonical_type for n in node_list}
    detected_labels = [n.label.lower() for n in node_list]

    covered: List[str] = []
    missing: List[str] = []
    for exp in expected_components:
        if isinstance(exp, str):
            exp_lower = exp.lower()
            if exp in detected_types or any(exp_lower in l for l in detected_labels):
                covered.append(exp)
            else:
                missing.append(exp)

    pct = round((len(covered) / len(expected_components) * 100)) if expected_components else 100

    summary_lines = [
        f"Nodes ({len(node_list)}): {', '.join(f'{n.label} ({n.canonical_type})' for n in node_list) or 'None'}",
        f"Flows ({len(flows)}): {', '.join(flows) or 'None'}",
        f"Expected Coverage: {len(covered)}/{len(expected_components)} ({pct}%)",
    ]
    if missing:
        summary_lines.append(f"Missing Expected: {', '.join(missing)}")

    return SceneGraphResult(
        nodes=node_list,
        edges=edges,
        flows=flows,
        covered_components=covered,
        missing_components=missing,
        coverage_percentage=pct,
        readable_summary="\n".join(summary_lines),
    )
