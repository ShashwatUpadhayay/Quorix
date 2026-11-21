import type { GeneratedQuestion } from "@/lib/questionPipeline/schemas";

/**
 * Offline fallback bank.
 *
 * These questions are approved by default so the interview pipeline works on a
 * fresh database before the LLM seed + human review process has run. They are
 * intentionally broad: each domain has an ice-breaker, three technical
 * questions at increasing difficulty, and one techno-managerial question.
 *
 * Bump CURATED_BANK_VERSION when this list changes.
 */
export const CURATED_BANK_VERSION = "2026-11-21.1";

export interface CuratedQuestionSeed extends GeneratedQuestion {
  source: "curated";
}

function q(
  topic: string,
  subtopic: string,
  stage: GeneratedQuestion["stage"],
  difficulty: number,
  text: string,
  expectedPoints: string[],
  competencyTags: string[]
): CuratedQuestionSeed {
  return {
    topic,
    subtopic,
    stage,
    difficulty,
    text,
    expectedPoints,
    competencyTags,
    source: "curated",
  };
}

export const CURATED_QUESTIONS: CuratedQuestionSeed[] = [
  // ---------------------------------------------------------------------------
  // Backend & APIs
  // ---------------------------------------------------------------------------
  q(
    "Backend & APIs",
    "API Design & Versioning",
    "icebreaker",
    2,
    "Walk me through a backend service you built end to end. What did you personally own, and which production constraint shaped the design the most?",
    [
      "Names a specific service and their concrete ownership",
      "Identifies a real constraint such as latency, traffic, compliance or team size",
      "Explains a design decision and its trade-off",
      "States a measurable outcome or lesson learned",
    ],
    ["API design", "ownership", "production constraints", "Node.js"]
  ),
  q(
    "Backend & APIs",
    "REST & HTTP",
    "technical",
    2,
    "A client reports that one of your REST endpoints sometimes returns a stale body right after an update. Walk me through how you would diagnose cache, replication and read-after-write issues.",
    [
      "Checks HTTP caching headers and intermediary caches",
      "Considers read replicas or cache invalidation lag",
      "Discusses idempotency and client retries",
      "Names logs, traces or metrics used to confirm the cause",
    ],
    ["REST", "HTTP caching", "replication lag", "observability"]
  ),
  q(
    "Backend & APIs",
    "API Design & Versioning",
    "technical",
    3,
    "You need to ship a breaking change to a public API used by mobile clients you cannot force-update. How do you version and roll it out safely?",
    [
      "Chooses an explicit versioning strategy and explains why",
      "Keeps old and new contracts running in parallel",
      "Describes deprecation communication and telemetry on old-client usage",
      "Adds contract tests and a rollback path",
    ],
    ["API contracts", "versioning", "backward compatibility", "contract tests"]
  ),
  q(
    "Backend & APIs",
    "Background Jobs & Queues",
    "technical",
    4,
    "Design a background job system for time-sensitive notifications where jobs must not be lost or executed twice. What delivery guarantees and failure handling do you use?",
    [
      "Uses a transactional outbox or equivalent durable enqueue",
      "Makes consumers idempotent with a stable deduplication key",
      "Defines retry, backoff and dead-letter handling",
      "Adds lag, failure and duplicate-rate observability",
    ],
    ["background jobs", "idempotency", "outbox pattern", "dead-letter queues"]
  ),
  q(
    "Backend & APIs",
    "API Design & Versioning",
    "techno_managerial",
    3,
    "Tell me about a time an API you owned caused a customer-facing incident. How did you communicate it, remediate it, and prevent recurrence?",
    [
      "Describes the customer impact and how it was detected",
      "Explains incident communication and ownership",
      "Identifies the root cause rather than only the symptom",
      "Names a concrete preventive change and how it was verified",
    ],
    ["incident management", "stakeholder communication", "root cause analysis"]
  ),

  // ---------------------------------------------------------------------------
  // Databases & Storage
  // ---------------------------------------------------------------------------
  q(
    "Databases & Storage",
    "Relational Modeling",
    "icebreaker",
    2,
    "Describe a database schema you designed. Which access patterns drove the keys and indexes, and what would you model differently today?",
    [
      "Describes the entities, relationships and access patterns",
      "Connects key or index choices to real queries",
      "Mentions a constraint that protected data integrity",
      "Reflects on a concrete modeling trade-off",
    ],
    ["schema design", "indexes", "access patterns", "PostgreSQL"]
  ),
  q(
    "Databases & Storage",
    "Indexing & Query Plans",
    "technical",
    2,
    "A query that was fast in staging becomes slow in production. How do you read the query plan and decide whether to add an index, rewrite the query, or change the schema?",
    [
      "Uses EXPLAIN or an equivalent plan inspection",
      "Distinguishes sequential scans, index scans and join strategy",
      "Checks data volume, statistics and parameter sensitivity",
      "Explains the write cost of adding an index",
    ],
    ["EXPLAIN", "indexes", "query optimization", "cardinality"]
  ),
  q(
    "Databases & Storage",
    "Transactions & Isolation",
    "technical",
    3,
    "Two services update the same business entity and you see lost updates under load. How do you fix it without serializing the entire system?",
    [
      "Identifies the lost-update race and the isolation level involved",
      "Considers optimistic locking or compare-and-set",
      "Explains retry behavior and idempotency",
      "Discusses ownership boundaries between the services",
    ],
    ["ACID", "isolation levels", "optimistic locking", "lost updates"]
  ),
  q(
    "Databases & Storage",
    "Replication & Sharding",
    "technical",
    4,
    "You need to scale a write-heavy relational database beyond one primary. Walk through your partitioning or sharding plan and how you handle cross-shard reads.",
    [
      "Chooses a shard key based on cardinality and access patterns",
      "Addresses hot partitions and rebalancing",
      "Explains cross-shard query or aggregation strategy",
      "Describes migration and rollback risk",
    ],
    ["sharding", "partitioning", "hot partitions", "rebalancing"]
  ),
  q(
    "Databases & Storage",
    "Relational Modeling",
    "techno_managerial",
    3,
    "Tell me about a data migration you led that carried real risk. How did you stage it, verify correctness, and decide when to roll back?",
    [
      "Describes the migration strategy and compatibility window",
      "Names verification or reconciliation checks",
      "Explains rollback criteria and who owned the decision",
      "Covers communication with dependent teams",
    ],
    ["migration", "rollback", "data integrity", "risk management"]
  ),

  // ---------------------------------------------------------------------------
  // Distributed Systems
  // ---------------------------------------------------------------------------
  q(
    "Distributed Systems",
    "Resilience Patterns",
    "icebreaker",
    2,
    "Tell me about a distributed system you worked on. Which failure mode worried you most, and what did you do about it?",
    [
      "Describes the system boundary and their role",
      "Names a concrete failure mode such as retries, partitions or skew",
      "Explains the mitigation and its residual risk",
      "Mentions how the failure would be detected",
    ],
    ["distributed systems", "failure modes", "resilience", "Kafka"]
  ),
  q(
    "Distributed Systems",
    "Messaging & Queues",
    "technical",
    2,
    "A consumer group is falling behind and the queue keeps growing. How do you find the bottleneck and restore throughput without dropping messages?",
    [
      "Checks consumer lag, processing time and downstream latency",
      "Distinguishes poison messages from capacity problems",
      "Discusses partition count and parallelism limits",
      "Preserves delivery guarantees while scaling",
    ],
    ["Kafka", "consumer groups", "backpressure", "throughput"]
  ),
  q(
    "Distributed Systems",
    "Consistency Models",
    "technical",
    3,
    "Explain how you would choose between strong and eventual consistency for a feature that spans two services. What user-visible behavior changes?",
    [
      "Frames the choice around user-visible guarantees",
      "Describes read-your-writes and staleness windows",
      "Considers reconciliation or compensation logic",
      "Names the operational cost of each option",
    ],
    ["consistency models", "eventual consistency", "read-your-writes"]
  ),
  q(
    "Distributed Systems",
    "Resilience Patterns",
    "technical",
    4,
    "Design a retry strategy for a service that calls a flaky downstream dependency. How do you avoid retry storms and cascading failures?",
    [
      "Uses exponential backoff with jitter and a retry budget",
      "Adds timeouts, circuit breakers and bulkheads",
      "Makes retried operations idempotent",
      "Defines fallback behavior and alerting",
    ],
    ["retries", "circuit breakers", "timeouts", "idempotency"]
  ),
  q(
    "Distributed Systems",
    "Event-Driven Architecture",
    "techno_managerial",
    4,
    "Describe a cross-team incident where ownership was unclear. How did you drive resolution and prevent it from repeating?",
    [
      "Explains how the incident was detected and escalated",
      "Describes how ownership was established under pressure",
      "Covers communication across teams",
      "Names a durable process or architecture change",
    ],
    ["incident management", "cross-team collaboration", "ownership"]
  ),

  // ---------------------------------------------------------------------------
  // Frontend & UI
  // ---------------------------------------------------------------------------
  q(
    "Frontend & UI",
    "React Architecture",
    "icebreaker",
    2,
    "Walk me through a frontend feature you shipped. What did you personally own, and what was the hardest UX or performance trade-off?",
    [
      "Names a specific feature and their ownership",
      "Describes a real UX or performance constraint",
      "Explains the trade-off and how it was validated",
      "Mentions user impact or a measurable result",
    ],
    ["React", "frontend", "UX trade-offs", "performance"]
  ),
  q(
    "Frontend & UI",
    "React Architecture",
    "technical",
    2,
    "A React page re-renders far more than expected after a state update. How do you diagnose the cause and decide where to split state or memoize?",
    [
      "Uses the React profiler or render tracking",
      "Distinguishes server state, local state and derived state",
      "Explains why memoization can hide a modeling problem",
      "Verifies the fix with a measurement",
    ],
    ["React", "re-renders", "state modeling", "profiling"]
  ),
  q(
    "Frontend & UI",
    "Rendering Performance",
    "technical",
    3,
    "A data-heavy table drops frames while filtering and scrolling. Walk through how you would profile and fix it.",
    [
      "Measures long tasks and render duration first",
      "Considers virtualization and debouncing",
      "Avoids unnecessary recomputation or DOM work",
      "Checks Core Web Vitals or frame timing after the fix",
    ],
    ["profiling", "virtualization", "Core Web Vitals", "memoization"]
  ),
  q(
    "Frontend & UI",
    "Design Systems",
    "technical",
    4,
    "You need to roll out a design-system change across many teams without breaking existing screens. How do you version components and coordinate adoption?",
    [
      "Defines a versioning and deprecation strategy",
      "Keeps component APIs backward compatible during migration",
      "Provides codemods, docs or visual regression coverage",
      "Tracks adoption and rollback risk",
    ],
    ["design systems", "versioning", "component APIs", "adoption"]
  ),
  q(
    "Frontend & UI",
    "Accessibility",
    "techno_managerial",
    3,
    "Tell me about a disagreement with design or product over a frontend trade-off. How did you resolve it with evidence?",
    [
      "Describes the disagreement without blaming others",
      "Uses user data, accessibility requirements or benchmarks",
      "Explains how the team reached a decision",
      "Reflects on what they would do differently",
    ],
    ["stakeholder communication", "accessibility", "trade-offs"]
  ),

  // ---------------------------------------------------------------------------
  // Cloud & DevOps
  // ---------------------------------------------------------------------------
  q(
    "Cloud & DevOps",
    "CI/CD",
    "icebreaker",
    2,
    "Describe a deployment you owned. What could have gone wrong, and what safeguards did you put in place?",
    [
      "Names the deployment target and their responsibility",
      "Identifies a realistic failure mode",
      "Explains a safeguard such as health checks or rollback",
      "Mentions how the deployment was observed",
    ],
    ["deployment", "CI/CD", "rollback", "Docker"]
  ),
  q(
    "Cloud & DevOps",
    "Containers",
    "technical",
    2,
    "A containerized service passes locally but crashes or gets OOM-killed in production. Walk through your investigation.",
    [
      "Checks resource limits and actual memory usage",
      "Compares environment, configuration and secrets",
      "Reads logs, events and exit codes",
      "Identifies whether the fix is code, image or platform configuration",
    ],
    ["Docker", "resource limits", "OOM", "observability"]
  ),
  q(
    "Cloud & DevOps",
    "CI/CD",
    "technical",
    3,
    "Design a deployment pipeline that can ship multiple times per day with automated rollback. What gates and metrics do you require?",
    [
      "Separates build, test and deploy stages",
      "Uses canary or progressive delivery with health metrics",
      "Defines automated rollback triggers",
      "Handles database migration compatibility",
    ],
    ["CI/CD", "canary releases", "rollbacks", "migration safety"]
  ),
  q(
    "Cloud & DevOps",
    "Cost & Reliability",
    "technical",
    4,
    "Your cloud bill doubled after a traffic spike. How do you find the cause and reduce cost without hurting reliability?",
    [
      "Attributes spend by service, tag and resource",
      "Distinguishes traffic-driven cost from waste or misconfiguration",
      "Considers caching, right-sizing and autoscaling",
      "Checks SLO impact before cutting capacity",
    ],
    ["FinOps", "cost attribution", "autoscaling", "SLOs"]
  ),
  q(
    "Cloud & DevOps",
    "Observability",
    "techno_managerial",
    3,
    "Tell me about an on-call or reliability process you improved. How did you measure the impact?",
    [
      "Describes the process problem and affected teams",
      "Explains the change and who adopted it",
      "Uses a metric such as MTTR, alert volume or error budget",
      "Reflects on trade-offs or follow-up work",
    ],
    ["on-call", "SLOs", "incident management", "observability"]
  ),

  // ---------------------------------------------------------------------------
  // Security & Testing
  // ---------------------------------------------------------------------------
  q(
    "Security & Testing",
    "Test Strategy",
    "icebreaker",
    2,
    "Tell me about a security or testing practice you introduced on a team. What problem did it solve, and how did people react?",
    [
      "Names the practice and the concrete risk it reduced",
      "Explains adoption and any resistance",
      "Mentions a measurable or observable outcome",
      "Reflects on what made it stick or fail",
    ],
    ["security", "testing", "quality", "team adoption"]
  ),
  q(
    "Security & Testing",
    "Authentication & Authorization",
    "technical",
    2,
    "A user reports seeing another tenant's data. Walk through how you would investigate and fix the authorization boundary.",
    [
      "Reproduces the issue and identifies the missing check",
      "Traces every data access path, not just the reported screen",
      "Adds server-side authorization and tenant scoping",
      "Adds regression tests and monitoring",
    ],
    ["authorization", "tenant isolation", "RBAC", "regression tests"]
  ),
  q(
    "Security & Testing",
    "OWASP & AppSec",
    "technical",
    3,
    "Pick a common web vulnerability and explain how you would prevent it across design, code review and automated testing.",
    [
      "Names a concrete vulnerability and its impact",
      "Addresses input validation and output encoding",
      "Adds review guidance and automated checks",
      "Considers defense in depth",
    ],
    ["OWASP", "input validation", "XSS", "code review"]
  ),
  q(
    "Security & Testing",
    "Test Strategy",
    "technical",
    4,
    "Design a test strategy for a service with critical money movement. What do you unit test, integration test and verify in production?",
    [
      "Prioritizes tests by risk and failure cost",
      "Covers idempotency, reconciliation and rollback",
      "Uses contract or integration tests for external systems",
      "Defines production verification and alerting",
    ],
    ["test strategy", "risk-based testing", "idempotency", "reconciliation"]
  ),
  q(
    "Security & Testing",
    "OWASP & AppSec",
    "techno_managerial",
    3,
    "Describe a time you pushed back on shipping because of security or quality risk. How did you make the case?",
    [
      "Explains the specific risk in business terms",
      "Shows how they influenced the decision",
      "Describes the mitigation or compromise reached",
      "Reflects on the outcome and relationship",
    ],
    ["risk communication", "security", "stakeholder communication"]
  ),

  // ---------------------------------------------------------------------------
  // AI & ML Systems
  // ---------------------------------------------------------------------------
  q(
    "AI & ML Systems",
    "LLM Applications",
    "icebreaker",
    2,
    "Tell me about an AI or ML feature you built. What did users actually need, and how did you measure whether it worked?",
    [
      "Describes the user problem and why AI was appropriate",
      "Names a concrete evaluation or success metric",
      "Explains a failure mode they observed",
      "Reflects on what they would change",
    ],
    ["LLM applications", "evaluation", "product thinking", "RAG"]
  ),
  q(
    "AI & ML Systems",
    "RAG & Retrieval",
    "technical",
    2,
    "Your RAG assistant gives confident but wrong answers. Walk through how you would diagnose retrieval, prompting and evaluation failures.",
    [
      "Separates retrieval failure from generation failure",
      "Inspects retrieved chunks and relevance",
      "Checks grounding and citation behavior",
      "Uses a labeled evaluation set rather than anecdotes",
    ],
    ["RAG", "retrieval", "grounding", "evaluation"]
  ),
  q(
    "AI & ML Systems",
    "Model Evaluation",
    "technical",
    3,
    "How do you build an evaluation set for an LLM feature and keep it trustworthy as prompts and models change?",
    [
      "Samples real user inputs and edge cases",
      "Defines rubric or automated graders with human review",
      "Tracks regressions across prompt and model versions",
      "Watches for dataset leakage and drift",
    ],
    ["eval sets", "rubrics", "regression testing", "model drift"]
  ),
  q(
    "AI & ML Systems",
    "Safety & Guardrails",
    "technical",
    4,
    "Design guardrails for a customer-facing LLM feature that must resist prompt injection and avoid leaking sensitive data.",
    [
      "Separates trusted instructions from untrusted content",
      "Applies input/output filtering and allow-lists",
      "Limits tool permissions and data access",
      "Defines fallback behavior and audit logging",
    ],
    ["prompt injection", "PII", "guardrails", "audit logging"]
  ),
  q(
    "AI & ML Systems",
    "Model Evaluation",
    "techno_managerial",
    3,
    "Tell me about a time you had to explain an AI system's limitations to stakeholders. How did you set expectations?",
    [
      "Describes the limitation and its user impact",
      "Explains how they communicated uncertainty",
      "Names a mitigation or product constraint",
      "Reflects on stakeholder trust",
    ],
    ["stakeholder communication", "AI limitations", "risk communication"]
  ),

  // ---------------------------------------------------------------------------
  // Data Engineering
  // ---------------------------------------------------------------------------
  q(
    "Data Engineering",
    "Batch Pipelines",
    "icebreaker",
    2,
    "Describe a data pipeline you owned. What was the most fragile part, and how did you make it reliable?",
    [
      "Names the sources, transforms and consumers",
      "Identifies a concrete fragility such as schema drift or late data",
      "Explains monitoring, retries or validation",
      "Mentions an SLA or data-quality outcome",
    ],
    ["data pipelines", "ETL", "data quality", "Airflow"]
  ),
  q(
    "Data Engineering",
    "Batch Pipelines",
    "technical",
    2,
    "A nightly batch job misses its SLA. How do you find where the time goes and decide between optimizing, parallelizing or re-architecting?",
    [
      "Measures stage-level duration and data volume",
      "Identifies skew, shuffles or slow queries",
      "Considers incremental processing before a rewrite",
      "Explains the cost and risk of each option",
    ],
    ["batch pipelines", "SLAs", "incremental loads", "performance"]
  ),
  q(
    "Data Engineering",
    "Data Quality",
    "technical",
    3,
    "How do you detect and handle bad data before it reaches dashboards or downstream models?",
    [
      "Defines freshness, completeness and validity checks",
      "Quarantines or blocks bad records",
      "Adds lineage and alerting",
      "Decides between failing the pipeline and degrading gracefully",
    ],
    ["data quality", "validation", "freshness", "lineage"]
  ),
  q(
    "Data Engineering",
    "Streaming",
    "technical",
    4,
    "Design a streaming pipeline that must deliver near-real-time metrics with exactly-once semantics. Where can duplicates or gaps appear?",
    [
      "Explains source, processing and sink guarantees",
      "Uses idempotent writes or transactional sinks",
      "Handles late data and watermarks",
      "Describes replay and backfill strategy",
    ],
    ["streaming", "exactly-once", "watermarks", "late data"]
  ),
  q(
    "Data Engineering",
    "Data Quality",
    "techno_managerial",
    3,
    "Tell me about a data quality incident you handled. How did you communicate impact and prevent recurrence?",
    [
      "Describes the bad data and who was affected",
      "Explains detection and communication",
      "Covers remediation and backfill",
      "Names a preventive control",
    ],
    ["data quality", "incident management", "communication"]
  ),

  // ---------------------------------------------------------------------------
  // Algorithms & Data Structures
  // ---------------------------------------------------------------------------
  q(
    "Algorithms & Data Structures",
    "Complexity Analysis",
    "icebreaker",
    2,
    "Walk me through an algorithmic problem you solved recently. What approach did you start with, and how did you improve it?",
    [
      "States the problem and initial approach",
      "Explains the complexity of the first solution",
      "Describes the optimization and why it works",
      "Mentions edge cases or trade-offs",
    ],
    ["algorithms", "Big-O", "problem solving", "edge cases"]
  ),
  q(
    "Algorithms & Data Structures",
    "Hash Maps & Sets",
    "technical",
    2,
    "Given an array of integers, find two numbers that sum to a target. Explain the brute-force and optimized approaches and their complexity.",
    [
      "Describes the O(n^2) brute-force approach",
      "Uses a hash map for O(n) lookup",
      "Explains space complexity and duplicate handling",
      "Mentions edge cases such as no solution",
    ],
    ["hashing", "arrays", "Big-O", "two sum"]
  ),
  q(
    "Algorithms & Data Structures",
    "Trees & Graphs",
    "technical",
    3,
    "You need to schedule tasks with dependencies and detect impossible cycles. Which graph algorithm do you use and why?",
    [
      "Models tasks as a directed graph",
      "Uses topological sort such as Kahn's algorithm",
      "Detects cycles via in-degree or DFS state",
      "Explains complexity and failure behavior",
    ],
    ["graphs", "topological sort", "cycle detection", "BFS"]
  ),
  q(
    "Algorithms & Data Structures",
    "Dynamic Programming",
    "technical",
    4,
    "Explain how you recognize a problem that needs dynamic programming, and walk through defining state and transition for an example.",
    [
      "Identifies overlapping subproblems and optimal substructure",
      "Defines a clear state and recurrence",
      "Discusses base cases and iteration order",
      "Compares memoization with tabulation",
    ],
    ["dynamic programming", "memoization", "state design", "optimal substructure"]
  ),
  q(
    "Algorithms & Data Structures",
    "Complexity Analysis",
    "techno_managerial",
    3,
    "Tell me about a time you had to simplify an overly complex technical solution. How did you decide what to remove?",
    [
      "Describes the complexity and its cost",
      "Explains the decision criteria",
      "Covers the simplification and its result",
      "Reflects on stakeholder alignment",
    ],
    ["simplification", "technical judgment", "communication"]
  ),

  // ---------------------------------------------------------------------------
  // Engineering Leadership
  // ---------------------------------------------------------------------------
  q(
    "Engineering Leadership",
    "Technical Strategy",
    "icebreaker",
    2,
    "Tell me about a project where you influenced the technical direction beyond your own tickets. What was the outcome?",
    [
      "Describes the technical direction and their influence",
      "Explains how they built support",
      "Names a concrete outcome",
      "Reflects on what they learned",
    ],
    ["technical leadership", "influence", "strategy"]
  ),
  q(
    "Engineering Leadership",
    "Technical Strategy",
    "technical",
    3,
    "How do you decide whether to build, buy or adopt an open-source solution for a new platform capability?",
    [
      "Compares total cost of ownership and time to value",
      "Assesses operational burden and security",
      "Considers vendor lock-in and exit strategy",
      "Defines a reversible decision process",
    ],
    ["build vs buy", "technical strategy", "total cost of ownership"]
  ),
  q(
    "Engineering Leadership",
    "Incident Management",
    "technical",
    3,
    "Walk me through how you run a production incident from detection to postmortem. What makes the process effective?",
    [
      "Defines roles and communication cadence",
      "Prioritizes mitigation before root cause",
      "Captures a timeline and customer impact",
      "Produces owned, verifiable follow-up actions",
    ],
    ["incident management", "postmortems", "communication", "triage"]
  ),
  q(
    "Engineering Leadership",
    "Mentoring & Growth",
    "technical",
    4,
    "How do you assess and grow an engineer who is technically strong but struggles with ambiguous problems?",
    [
      "Diagnoses the specific gap with examples",
      "Sets scoped opportunities with decreasing ambiguity",
      "Provides feedback and reflection loops",
      "Measures progress without over-managing",
    ],
    ["mentoring", "coaching", "feedback", "delegation"]
  ),
  q(
    "Engineering Leadership",
    "Stakeholder Communication",
    "techno_managerial",
    4,
    "Describe a time you had to deliver bad news about a project to leadership. How did you frame it, and what happened next?",
    [
      "Explains the facts and impact clearly",
      "Takes ownership without deflecting",
      "Presents options and a recommendation",
      "Describes the outcome and relationship impact",
    ],
    ["executive communication", "ownership", "risk communication"]
  ),
];
