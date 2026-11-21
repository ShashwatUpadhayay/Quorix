/**
 * Frozen question-bank taxonomy.
 *
 * Everything downstream (seeding, retrieval, coverage, matching) depends on
 * these names. Add new domains/subtopics at the end and bump
 * CURATED_BANK_VERSION so existing deployments re-seed the curated fallback.
 */

export const PIPELINE_STAGES = [
  "icebreaker",
  "technical",
  "techno_managerial",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface SubtopicDefinition {
  name: string;
  tags: string[];
}

export interface DomainDefinition {
  name: string;
  description: string;
  /** Resume / UI labels that should resolve to this domain. */
  aliases: string[];
  /** Keywords found in a focus string or profile that imply this domain. */
  focusKeywords: string[];
  subtopics: SubtopicDefinition[];
}

export const QUESTION_TAXONOMY: DomainDefinition[] = [
  {
    name: "Backend & APIs",
    description:
      "Server-side application design, HTTP/RPC contracts, auth, caching and background work.",
    aliases: ["backend", "api", "apis", "server-side", "web services"],
    focusKeywords: [
      "node",
      "node.js",
      "nodejs",
      "express",
      "nestjs",
      "fastapi",
      "django",
      "flask",
      "spring",
      "laravel",
      "rails",
      "rest",
      "graphql",
      "grpc",
      "trpc",
      "api",
      "backend",
      "microservice",
      "webhook",
      "background job",
      "queue consumer",
    ],
    subtopics: [
      {
        name: "REST & HTTP",
        tags: ["REST", "HTTP semantics", "status codes", "idempotency"],
      },
      {
        name: "GraphQL & RPC",
        tags: ["GraphQL", "gRPC", "schema design", "N+1 queries"],
      },
      {
        name: "Authentication",
        tags: ["OAuth", "JWT", "sessions", "authorization"],
      },
      {
        name: "API Design & Versioning",
        tags: ["API contracts", "versioning", "backward compatibility"],
      },
      {
        name: "Caching & Performance",
        tags: ["caching", "latency", "connection pooling", "profiling"],
      },
      {
        name: "Background Jobs & Queues",
        tags: ["background jobs", "idempotency", "retries", "dead-letter queues"],
      },
    ],
  },
  {
    name: "Databases & Storage",
    description:
      "Relational and NoSQL data modeling, query performance, transactions and scaling storage.",
    aliases: ["database", "databases", "storage", "data layer", "persistence"],
    focusKeywords: [
      "postgres",
      "postgresql",
      "mysql",
      "mariadb",
      "mongodb",
      "redis",
      "dynamodb",
      "cassandra",
      "elasticsearch",
      "sql",
      "nosql",
      "prisma",
      "drizzle",
      "orm",
      "index",
      "database",
    ],
    subtopics: [
      {
        name: "Relational Modeling",
        tags: ["schema design", "normalization", "constraints", "foreign keys"],
      },
      {
        name: "Indexing & Query Plans",
        tags: ["indexes", "EXPLAIN", "query optimization", "cardinality"],
      },
      {
        name: "Transactions & Isolation",
        tags: ["ACID", "isolation levels", "locking", "lost updates"],
      },
      {
        name: "NoSQL Design",
        tags: ["document modeling", "access patterns", "eventual consistency"],
      },
      {
        name: "Replication & Sharding",
        tags: ["replication lag", "sharding", "failover", "hot partitions"],
      },
      {
        name: "Caching & Redis",
        tags: ["Redis", "cache invalidation", "cache-aside", "TTL"],
      },
    ],
  },
  {
    name: "Distributed Systems",
    description:
      "Messaging, consensus, failure handling and consistency across service boundaries.",
    aliases: ["distributed", "distributed systems", "messaging", "platform"],
    focusKeywords: [
      "kafka",
      "rabbitmq",
      "sqs",
      "pubsub",
      "nats",
      "temporal",
      "celery",
      "event-driven",
      "distributed",
      "consensus",
      "raft",
      "paxos",
      "sharding",
      "partition",
      "idempotency",
      "microservices",
    ],
    subtopics: [
      {
        name: "Messaging & Queues",
        tags: ["Kafka", "consumer groups", "backpressure", "ordering"],
      },
      {
        name: "Consensus & Replication",
        tags: ["Raft", "leader election", "quorum", "replication"],
      },
      {
        name: "Event-Driven Architecture",
        tags: ["events", "outbox pattern", "schema evolution", "sagas"],
      },
      {
        name: "Resilience Patterns",
        tags: ["retries", "circuit breakers", "bulkheads", "timeouts"],
      },
      {
        name: "Observability",
        tags: ["tracing", "metrics", "logging", "SLOs"],
      },
      {
        name: "Consistency Models",
        tags: ["strong consistency", "eventual consistency", "read-your-writes"],
      },
    ],
  },
  {
    name: "Frontend & UI",
    description:
      "Component architecture, rendering performance, accessibility and design systems.",
    aliases: ["frontend", "front-end", "ui", "web ui", "client"],
    focusKeywords: [
      "react",
      "next.js",
      "nextjs",
      "vue",
      "angular",
      "svelte",
      "typescript",
      "javascript",
      "tailwind",
      "css",
      "html",
      "redux",
      "zustand",
      "frontend",
      "accessibility",
      "design system",
    ],
    subtopics: [
      {
        name: "React Architecture",
        tags: ["React", "component boundaries", "hooks", "re-renders"],
      },
      {
        name: "State Management",
        tags: ["state modeling", "derived state", "server state", "caching"],
      },
      {
        name: "Rendering Performance",
        tags: ["profiling", "virtualization", "memoization", "Core Web Vitals"],
      },
      {
        name: "Accessibility",
        tags: ["WCAG", "keyboard navigation", "screen readers", "semantics"],
      },
      {
        name: "Design Systems",
        tags: ["design tokens", "component APIs", "versioning", "adoption"],
      },
      {
        name: "Browser & Networking",
        tags: ["HTTP caching", "CORS", "service workers", "hydration"],
      },
    ],
  },
  {
    name: "Cloud & DevOps",
    description:
      "Deployment, infrastructure, observability and operating production systems safely.",
    aliases: ["cloud", "devops", "infrastructure", "platform engineering", "sre"],
    focusKeywords: [
      "aws",
      "gcp",
      "azure",
      "docker",
      "kubernetes",
      "k8s",
      "terraform",
      "pulumi",
      "ci/cd",
      "github actions",
      "linux",
      "nginx",
      "prometheus",
      "grafana",
      "helm",
      "cloud",
      "devops",
      "sre",
    ],
    subtopics: [
      {
        name: "Containers",
        tags: ["Docker", "image size", "resource limits", "health checks"],
      },
      {
        name: "Kubernetes",
        tags: ["deployments", "autoscaling", "probes", "pod disruption"],
      },
      {
        name: "CI/CD",
        tags: ["pipelines", "rollbacks", "canary releases", "migration safety"],
      },
      {
        name: "Infrastructure as Code",
        tags: ["Terraform", "drift", "modules", "policy as code"],
      },
      {
        name: "Observability",
        tags: ["metrics", "logs", "traces", "alerting"],
      },
      {
        name: "Cost & Reliability",
        tags: ["FinOps", "SLOs", "multi-AZ", "capacity planning"],
      },
    ],
  },
  {
    name: "Security & Testing",
    description:
      "Application security, identity boundaries, encryption and risk-based test strategy.",
    aliases: ["security", "testing", "qa", "appsec", "quality"],
    focusKeywords: [
      "oauth",
      "oidc",
      "jwt",
      "rbac",
      "abac",
      "owasp",
      "encryption",
      "tls",
      "security",
      "playwright",
      "jest",
      "vitest",
      "cypress",
      "testing",
      "qa",
      "penetration",
    ],
    subtopics: [
      {
        name: "Authentication & Authorization",
        tags: ["OAuth", "RBAC", "tenant isolation", "session security"],
      },
      {
        name: "OWASP & AppSec",
        tags: ["injection", "XSS", "CSRF", "input validation"],
      },
      {
        name: "Secrets & Encryption",
        tags: ["secret management", "key rotation", "encryption at rest"],
      },
      {
        name: "Test Strategy",
        tags: ["test pyramid", "risk-based testing", "contract tests"],
      },
      {
        name: "Test Automation",
        tags: ["E2E tests", "flaky tests", "CI test suites", "fixtures"],
      },
      {
        name: "Supply Chain Security",
        tags: ["dependency scanning", "SBOM", "build provenance"],
      },
    ],
  },
  {
    name: "AI & ML Systems",
    description:
      "LLM applications, retrieval, evaluation and operating AI features in production.",
    aliases: ["ai", "ml", "machine learning", "llm", "genai", "ai systems"],
    focusKeywords: [
      "pytorch",
      "tensorflow",
      "llm",
      "rag",
      "langchain",
      "openai",
      "gemini",
      "ollama",
      "machine learning",
      "deep learning",
      "nlp",
      "embeddings",
      "vector",
      "huggingface",
      "scikit-learn",
      "mlops",
      "ai",
      "ml",
    ],
    subtopics: [
      {
        name: "LLM Applications",
        tags: ["prompting", "structured output", "tool calling", "latency"],
      },
      {
        name: "RAG & Retrieval",
        tags: ["chunking", "hybrid search", "reranking", "grounding"],
      },
      {
        name: "Model Evaluation",
        tags: ["eval sets", "rubrics", "regression testing", "human review"],
      },
      {
        name: "Vector Search",
        tags: ["embeddings", "ANN indexes", "recall", "metadata filters"],
      },
      {
        name: "MLOps",
        tags: ["model rollout", "monitoring", "drift", "cost attribution"],
      },
      {
        name: "Safety & Guardrails",
        tags: ["prompt injection", "PII", "moderation", "fallback routing"],
      },
    ],
  },
  {
    name: "Data Engineering",
    description:
      "Batch and streaming pipelines, data modeling, orchestration and data quality.",
    aliases: ["data engineering", "data platform", "analytics engineering", "etl"],
    focusKeywords: [
      "airflow",
      "dagster",
      "prefect",
      "dbt",
      "spark",
      "flink",
      "databricks",
      "snowflake",
      "bigquery",
      "redshift",
      "etl",
      "elt",
      "data pipeline",
      "data warehouse",
      "data engineering",
    ],
    subtopics: [
      {
        name: "Batch Pipelines",
        tags: ["ETL", "incremental loads", "backfills", "SLAs"],
      },
      {
        name: "Streaming",
        tags: ["windowing", "exactly-once", "watermarks", "late data"],
      },
      {
        name: "Data Modeling",
        tags: ["star schema", "dimensional modeling", "grain", "lineage"],
      },
      {
        name: "Orchestration",
        tags: ["Airflow", "dependencies", "retries", "idempotent runs"],
      },
      {
        name: "Data Quality",
        tags: ["validation", "freshness", "anomaly detection", "contracts"],
      },
      {
        name: "Warehousing & Analytics",
        tags: ["partitioning", "clustering", "query cost", "semantic layer"],
      },
    ],
  },
  {
    name: "Algorithms & Data Structures",
    description:
      "Problem solving, complexity analysis and choosing the right data structure under constraints.",
    aliases: ["algorithms", "data structures", "dsa", "coding", "computer science"],
    focusKeywords: [
      "algorithm",
      "algorithms",
      "data structures",
      "leetcode",
      "dynamic programming",
      "graph",
      "tree",
      "heap",
      "trie",
      "complexity",
      "coding",
      "dsa",
    ],
    subtopics: [
      {
        name: "Arrays & Strings",
        tags: ["two pointers", "sliding window", "sorting", "strings"],
      },
      {
        name: "Hash Maps & Sets",
        tags: ["hashing", "frequency maps", "lookup trade-offs"],
      },
      {
        name: "Trees & Graphs",
        tags: ["BFS", "DFS", "topological sort", "shortest paths"],
      },
      {
        name: "Dynamic Programming",
        tags: ["memoization", "tabulation", "state design", "optimal substructure"],
      },
      {
        name: "Complexity Analysis",
        tags: ["Big-O", "space complexity", "amortized analysis"],
      },
      {
        name: "Recursion & Backtracking",
        tags: ["recursion", "pruning", "permutations", "base cases"],
      },
    ],
  },
  {
    name: "Engineering Leadership",
    description:
      "Technical strategy, delivery, incidents, mentoring and cross-team influence.",
    aliases: ["leadership", "management", "engineering management", "behavioral"],
    focusKeywords: [
      "leadership",
      "management",
      "mentoring",
      "stakeholder",
      "roadmap",
      "strategy",
      "hiring",
      "behavioral",
      "principal",
      "staff engineer",
      "tech lead",
    ],
    subtopics: [
      {
        name: "Technical Strategy",
        tags: ["build vs buy", "roadmaps", "architecture direction", "trade-offs"],
      },
      {
        name: "Project Delivery",
        tags: ["planning", "estimation", "risk management", "scope"],
      },
      {
        name: "Incident Management",
        tags: ["triage", "communication", "postmortems", "blameless culture"],
      },
      {
        name: "Mentoring & Growth",
        tags: ["coaching", "feedback", "delegation", "growth plans"],
      },
      {
        name: "Stakeholder Communication",
        tags: ["executive updates", "alignment", "influence", "trade-offs"],
      },
      {
        name: "Hiring & Team Building",
        tags: ["interviewing", "team design", "onboarding", "culture"],
      },
    ],
  },
];

export const DOMAIN_NAMES = QUESTION_TAXONOMY.map((domain) => domain.name);

export const STAGE_LABELS: Record<PipelineStage, string> = {
  icebreaker: "Ice-breaker",
  technical: "Technical",
  techno_managerial: "Techno-managerial",
};

export function isPipelineStage(value: unknown): value is PipelineStage {
  return (
    typeof value === "string" &&
    (PIPELINE_STAGES as readonly string[]).includes(value)
  );
}

export function getDomain(name: string | undefined | null): DomainDefinition | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  return (
    QUESTION_TAXONOMY.find(
      (domain) =>
        domain.name.toLowerCase() === normalized ||
        domain.aliases.some((alias) => alias.toLowerCase() === normalized)
    ) || null
  );
}

export function getSubtopic(
  domainName: string,
  subtopicName: string | undefined | null
): SubtopicDefinition | null {
  const domain = getDomain(domainName);
  if (!domain) return null;
  const normalized = (subtopicName || "").trim().toLowerCase();
  return (
    domain.subtopics.find((subtopic) => subtopic.name.toLowerCase() === normalized) ||
    null
  );
}

export function listSubtopics(domainName: string): string[] {
  return getDomain(domainName)?.subtopics.map((subtopic) => subtopic.name) || [];
}

export function allCompetencyTags(): string[] {
  const tags = new Set<string>();
  for (const domain of QUESTION_TAXONOMY) {
    tags.add(domain.name);
    for (const subtopic of domain.subtopics) {
      tags.add(subtopic.name);
      subtopic.tags.forEach((tag) => tags.add(tag));
    }
  }
  return Array.from(tags);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

/**
 * Resolves the most likely taxonomy domain from a focus label, primary topics
 * and resume tags. Exact domain names win, then keyword matches.
 */
export function resolveDomain(params: {
  focus?: string;
  primaryTopics?: string[];
  profileTags?: string[];
  interviewType?: string;
}): DomainDefinition {
  const { focus, primaryTopics = [], profileTags = [], interviewType } = params;

  if (interviewType === "coding") {
    return getDomain("Algorithms & Data Structures") || QUESTION_TAXONOMY[0];
  }
  if (interviewType === "behavioral") {
    return getDomain("Engineering Leadership") || QUESTION_TAXONOMY[0];
  }

  for (const candidate of [focus, ...primaryTopics]) {
    const direct = getDomain(candidate);
    if (direct) return direct;
  }

  const corpus = tokenize(
    [focus, ...primaryTopics, ...profileTags].filter(Boolean).join(" ")
  );
  const corpusSet = new Set(corpus);

  let best: { domain: DomainDefinition; score: number } | null = null;
  for (const domain of QUESTION_TAXONOMY) {
    let score = 0;
    for (const keyword of domain.focusKeywords) {
      const normalized = keyword.toLowerCase();
      if (normalized.includes(" ")) {
        if (` ${corpus.join(" ")} `.includes(` ${normalized} `)) score += 3;
      } else if (corpusSet.has(normalized)) {
        score += 3;
      } else if (corpus.some((token) => token.includes(normalized))) {
        score += 1;
      }
    }
    for (const alias of domain.aliases) {
      if (corpusSet.has(alias.toLowerCase())) score += 2;
    }
    if (score > (best?.score || 0)) {
      best = { domain, score };
    }
  }

  return best?.domain || getDomain("Backend & APIs") || QUESTION_TAXONOMY[0];
}

export function normalizeDomainName(name: string): string {
  return getDomain(name)?.name || name.trim();
}

export function normalizeSubtopicName(
  domainName: string,
  subtopicName: string
): string {
  return (
    getSubtopic(domainName, subtopicName)?.name || subtopicName.trim()
  );
}

export function pickSubtopics(domainName: string, count = 3): SubtopicDefinition[] {
  const domain = getDomain(domainName);
  if (!domain) return [];
  return domain.subtopics.slice(0, Math.max(1, count));
}

export function stageForInterviewType(
  interviewType: string | undefined,
  questionNumber: number
): PipelineStage {
  if (questionNumber <= 1) return "icebreaker";
  if (interviewType === "behavioral") return "techno_managerial";
  return "technical";
}
