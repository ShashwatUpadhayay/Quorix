import type {
  DifficultyTier,
  ExperienceItem,
  InterviewConfig,
  SkillItem,
} from "@/lib/mongodb";

export interface AdaptiveQuestion {
  id: string;
  stage: "icebreaker" | "technical" | "managerial";
  topic: string;
  difficulty: DifficultyTier;
  prompt: string;
  rubricHint: string;
}

export interface AdaptiveEvaluation {
  relevance: number;
  depth: number;
  clarity: number;
  overall: number;
  feedback: string;
}

const TOPIC_KEYWORDS: Record<string, string[]> = {
  "Distributed Systems": [
    "kafka",
    "rabbitmq",
    "grpc",
    "microservices",
    "raft",
    "paxos",
    "consensus",
    "distributed",
    "event-driven",
    "celery",
    "temporal",
    "concurrency",
    "sharding",
  ],
  "Backend & APIs": [
    "node",
    "nodejs",
    "node.js",
    "express",
    "nestjs",
    "python",
    "fastapi",
    "django",
    "flask",
    "go",
    "golang",
    "java",
    "spring",
    "rust",
    "c#",
    ".net",
    "rest",
    "graphql",
    "trpc",
    "api",
  ],
  "Databases & Storage": [
    "postgresql",
    "postgres",
    "mysql",
    "mongodb",
    "redis",
    "dynamodb",
    "cassandra",
    "elasticsearch",
    "sql",
    "nosql",
    "prisma",
    "drizzle",
    "indexing",
  ],
  "Frontend & UI": [
    "react",
    "next.js",
    "nextjs",
    "typescript",
    "javascript",
    "vue",
    "angular",
    "svelte",
    "tailwind",
    "css",
    "html",
    "webpack",
    "vite",
    "redux",
    "zustand",
  ],
  "Cloud & DevOps": [
    "aws",
    "gcp",
    "azure",
    "docker",
    "kubernetes",
    "k8s",
    "terraform",
    "ci/cd",
    "github actions",
    "linux",
    "nginx",
    "prometheus",
    "grafana",
    "helm",
  ],
  "AI & ML Systems": [
    "pytorch",
    "tensorflow",
    "llm",
    "rag",
    "langchain",
    "openai",
    "machine learning",
    "deep learning",
    "nlp",
    "embeddings",
    "vector",
    "huggingface",
    "scikit-learn",
    "mlops",
  ],
  "Security & Testing": [
    "oauth",
    "jwt",
    "oidc",
    "rbac",
    "playwright",
    "jest",
    "vitest",
    "cypress",
    "security",
    "encryption",
    "tls",
  ],
};

function estimateExperienceYears(
  experience: ExperienceItem[],
  headline: string,
  rawText?: string
): number {
  let totalYears = 0;

  // Check explicit "X+ years" or "X years" mentions in headline or raw text
  const textPool = `${headline} ${rawText || ""}`;
  const explicitMatch = textPool.match(/(\d{1,2})\+?\s*(?:years|yrs)\s+(?:of\s+)?experience/i);
  if (explicitMatch) {
    totalYears = Math.max(totalYears, parseInt(explicitMatch[1], 10));
  }

  // Sum approximate spans from experience periods (e.g. "2021 - 2024", "2022 - Present")
  const currentYear = new Date().getFullYear();
  for (const exp of experience) {
    const years = exp.period.match(/\b(19|20)\d{2}\b/g);
    if (years && years.length >= 1) {
      const start = parseInt(years[0], 10);
      const end = /present|current|now/i.test(exp.period)
        ? currentYear
        : years[1]
          ? parseInt(years[1], 10)
          : start + 1;
      if (end >= start && end - start <= 25) {
        totalYears += Math.max(1, end - start);
      }
    } else if (exp.role.trim()) {
      totalYears += 1.5;
    }
  }

  if (totalYears === 0) {
    if (/\b(principal|staff|architect|distinguished|vp|director)\b/i.test(headline)) {
      return 8;
    }
    if (/\b(senior|sr\.?|lead|manager)\b/i.test(headline)) {
      return 5;
    }
    if (/\b(mid|intermediate|ii)\b/i.test(headline)) {
      return 3;
    }
    if (/\b(intern|junior|jr\.?|entry|graduate|fresher)\b/i.test(headline)) {
      return 1;
    }
  }

  return Math.min(25, Math.round(totalYears * 10) / 10);
}

function classifyDifficulty(
  years: number,
  headline: string,
  skillCount: number
): { tier: DifficultyTier; numeric: number } {
  if (
    years >= 8 ||
    /\b(staff|principal|distinguished|architect|vp|director)\b/i.test(headline)
  ) {
    return { tier: "Staff", numeric: 4 };
  }
  if (years >= 4.5 || /\b(senior|sr\.?|lead|tech lead)\b/i.test(headline)) {
    return { tier: "Senior", numeric: 3 };
  }
  if (years >= 2 || skillCount >= 5) {
    return { tier: "Intermediate", numeric: 2 };
  }
  return { tier: "Foundational", numeric: 1 };
}

export function computeInterviewConfig(params: {
  skills: SkillItem[];
  experience: ExperienceItem[];
  headline: string;
  rawText?: string;
}): InterviewConfig {
  const { skills, experience, headline, rawText } = params;
  const years = estimateExperienceYears(experience, headline, rawText);
  const { tier, numeric } = classifyDifficulty(years, headline, skills.length);

  const combinedCorpus = [
    headline,
    ...skills.map((s) => s.name),
    ...experience.map((e) => `${e.role} ${e.summary}`),
  ]
    .join(" ")
    .toLowerCase();

  const topicScores: { topic: string; score: number }[] = [];
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (combinedCorpus.includes(kw)) {
        score += 1;
      }
    }
    if (score > 0) {
      topicScores.push({ topic, score });
    }
  }

  topicScores.sort((a, b) => b.score - a.score);

  const primaryTopics =
    topicScores.length > 0
      ? topicScores.slice(0, 4).map((t) => t.topic)
      : ["Backend & APIs", "Databases & Storage"];

  const coreSkills = skills
    .filter((s) => s.level === "Core")
    .map((s) => s.name);
  const allSkillNames = skills.map((s) => s.name);
  const focusAreas = (coreSkills.length > 0 ? coreSkills : allSkillNames).slice(
    0,
    8
  );

  const recommendedTrack = `${tier} ${primaryTopics[0]} Track`;

  return {
    experienceYears: years,
    difficultyTier: tier,
    difficultyNumeric: numeric,
    primaryTopics,
    focusAreas: focusAreas.length > 0 ? focusAreas : ["System Design", "Data Structures"],
    recommendedTrack,
    lastParsedAt: new Date(),
  };
}

interface QuestionTemplate {
  topic: string;
  tier: DifficultyTier;
  stage: "icebreaker" | "technical" | "managerial";
  prompt: (focus: string) => string;
  rubricHint: string;
}

const QUESTION_TEMPLATES: QuestionTemplate[] = [
  // Icebreaker
  {
    topic: "General",
    tier: "Foundational",
    stage: "icebreaker",
    prompt: (focus) =>
      `Walk me through a recent project where you used ${focus}. What was your specific contribution and one technical challenge you solved?`,
    rubricHint: "Look for clear ownership, concrete problem framing, and foundational understanding.",
  },
  {
    topic: "General",
    tier: "Intermediate",
    stage: "icebreaker",
    prompt: (focus) =>
      `Tell me about a production feature you built around ${focus}. What architectural trade-offs did you weigh before shipping?`,
    rubricHint: "Expect trade-off awareness, testing approach, and end-to-end delivery clarity.",
  },
  {
    topic: "General",
    tier: "Senior",
    stage: "icebreaker",
    prompt: (focus) =>
      `Describe the most complex system you owned involving ${focus}. How did you handle reliability, bottlenecks, and cross-team alignment?`,
    rubricHint: "Assess systems thinking, operational rigor, and measurable production impact.",
  },
  {
    topic: "General",
    tier: "Staff",
    stage: "icebreaker",
    prompt: (focus) =>
      `Across your tenure with ${focus}, what platform-wide architectural shift did you champion, and how did you prove its ROI to leadership?`,
    rubricHint: "Evaluate multi-team influence, long-term technical strategy, and risk mitigation.",
  },

  // Distributed Systems
  {
    topic: "Distributed Systems",
    tier: "Foundational",
    stage: "technical",
    prompt: (focus) =>
      `When two services communicate asynchronously using ${focus}, what happens if a message is delivered twice? How do you prevent duplicate processing?`,
    rubricHint: "Idempotency keys, unique constraints, and at-least-once delivery semantics.",
  },
  {
    topic: "Distributed Systems",
    tier: "Intermediate",
    stage: "technical",
    prompt: (focus) =>
      `How would you design a resilient retry and dead-letter strategy in a ${focus} pipeline without overwhelming a recovering downstream service?`,
    rubricHint: "Exponential backoff with jitter, circuit breakers, DLQ replay policies.",
  },
  {
    topic: "Distributed Systems",
    tier: "Senior",
    stage: "technical",
    prompt: (focus) =>
      `In a high-throughput ${focus} architecture, how do you preserve ordering guarantees per tenant while scaling consumers horizontally and avoiding hot partitions?`,
    rubricHint: "Partition key design, consumer group rebalancing, backpressure, and split-brain risks.",
  },
  {
    topic: "Distributed Systems",
    tier: "Staff",
    stage: "technical",
    prompt: (focus) =>
      `Design a multi-region active-active architecture around ${focus}. How do you reconcile split-brain writes, clock skew, and bounded staleness SLAs?`,
    rubricHint: "Consensus boundaries, CRDTs/vector clocks, regional failover, and consistency guarantees.",
  },

  // Backend & APIs
  {
    topic: "Backend & APIs",
    tier: "Foundational",
    stage: "technical",
    prompt: (focus) =>
      `In ${focus}, how do you structure input validation, error responses, and HTTP status codes so client integrations remain predictable?`,
    rubricHint: "Schema validation, consistent error contracts, 4xx vs 5xx separation.",
  },
  {
    topic: "Backend & APIs",
    tier: "Intermediate",
    stage: "technical",
    prompt: (focus) =>
      `Your ${focus} endpoint latency spikes from 40ms to 1.8s under peak traffic. Walk through how you profile, isolate, and fix the bottleneck.`,
    rubricHint: "N+1 queries, connection pooling, async I/O blocking, caching, observability.",
  },
  {
    topic: "Backend & APIs",
    tier: "Senior",
    stage: "technical",
    prompt: (focus) =>
      `Design a rate-limiting and tenant-isolation layer for a public ${focus} gateway serving bursty enterprise traffic with strict p99 SLOs.`,
    rubricHint: "Token bucket/sliding window in Redis, graceful degradation, noisy-neighbor isolation.",
  },
  {
    topic: "Backend & APIs",
    tier: "Staff",
    stage: "technical",
    prompt: (focus) =>
      `You are decomposing a critical ${focus} monolith into domain services with zero downtime. How do you sequence data ownership, dual-writes, and contract versioning?`,
    rubricHint: "Strangler fig pattern, CDC/outbox, backward-compatible schemas, rollback safety.",
  },

  // Databases & Storage
  {
    topic: "Databases & Storage",
    tier: "Foundational",
    stage: "technical",
    prompt: (focus) =>
      `How do indexes speed up reads in ${focus}, and what write or storage trade-offs do you accept when adding composite indexes?`,
    rubricHint: "B-tree/index selectivity, column order, write amplification.",
  },
  {
    topic: "Databases & Storage",
    tier: "Intermediate",
    stage: "technical",
    prompt: (focus) =>
      `When using ${focus}, how do you diagnose a slow query plan and decide between query refactoring, indexing, or caching?`,
    rubricHint: "EXPLAIN ANALYZE, sequential scans, cache invalidation trade-offs.",
  },
  {
    topic: "Databases & Storage",
    tier: "Senior",
    stage: "technical",
    prompt: (focus) =>
      `When scaling ${focus} past a single primary node, how do you choose a shard key to avoid hotspot skew and minimize cross-shard joins?`,
    rubricHint: "Cardinality, range vs hash sharding, scatter-gather mitigation, rebalancing.",
  },
  {
    topic: "Databases & Storage",
    tier: "Staff",
    stage: "technical",
    prompt: (focus) =>
      `Design a zero-downtime schema and storage migration for a 10TB ${focus} cluster handling 50k writes/sec while preserving strong transactional invariants.`,
    rubricHint: "Expand-and-contract migrations, shadow tables, replication lag monitoring, cutover verification.",
  },

  // Frontend & UI
  {
    topic: "Frontend & UI",
    tier: "Foundational",
    stage: "technical",
    prompt: (focus) =>
      `In ${focus}, how do you structure component state vs derived state to prevent unnecessary re-renders and stale UI?`,
    rubricHint: "Single source of truth, effect cleanup, predictable state updates.",
  },
  {
    topic: "Frontend & UI",
    tier: "Intermediate",
    stage: "technical",
    prompt: (focus) =>
      `A data-heavy ${focus} view drops frames during filtering and scrolling. How do you measure and resolve the rendering bottleneck?`,
    rubricHint: "Profiler flamegraphs, virtualization, memoization boundaries, debouncing.",
  },
  {
    topic: "Frontend & UI",
    tier: "Senior",
    stage: "technical",
    prompt: (focus) =>
      `Architect an accessible, offline-resilient ${focus} application with optimistic updates, conflict reconciliation, and strict Core Web Vitals budgets.`,
    rubricHint: "Optimistic rollback, hydration/SSR boundaries, keyboard/WCAG semantics, bundle splitting.",
  },
  {
    topic: "Frontend & UI",
    tier: "Staff",
    stage: "technical",
    prompt: (focus) =>
      `Design a multi-team micro-frontend and design-system architecture in ${focus} without shipping duplicate runtimes or fragmenting UX consistency.`,
    rubricHint: "Module federation/package contracts, shared tokens, independent deployability.",
  },

  // Cloud & DevOps
  {
    topic: "Cloud & DevOps",
    tier: "Foundational",
    stage: "technical",
    prompt: (focus) =>
      `Explain how you configure health checks, environment secrets, and container resource limits when deploying with ${focus}.`,
    rubricHint: "Liveness vs readiness probes, secret injection, CPU/memory requests & limits.",
  },
  {
    topic: "Cloud & DevOps",
    tier: "Intermediate",
    stage: "technical",
    prompt: (focus) =>
      `How do you design a zero-downtime rolling or blue-green deployment pipeline using ${focus} with automated rollback triggers?`,
    rubricHint: "Canary metrics, connection draining, database migration compatibility.",
  },
  {
    topic: "Cloud & DevOps",
    tier: "Senior",
    stage: "technical",
    prompt: (focus) =>
      `Design a multi-AZ, cost-aware ${focus} infrastructure that survives an availability zone outage without manual intervention.`,
    rubricHint: "Autoscaling policies, pod disruption budgets, blast-radius isolation, IaC drift control.",
  },
  {
    topic: "Cloud & DevOps",
    tier: "Staff",
    stage: "technical",
    prompt: (focus) =>
      `How do you standardize golden paths, FinOps guardrails, and compliance controls across 40+ product teams using ${focus}?`,
    rubricHint: "Policy-as-code, self-service modules, SLO error budgets, platform adoption.",
  },

  // AI & ML Systems
  {
    topic: "AI & ML Systems",
    tier: "Foundational",
    stage: "technical",
    prompt: (focus) =>
      `When building with ${focus}, how do you split, chunk, and evaluate outputs so the system avoids hallucinated or irrelevant responses?`,
    rubricHint: "Chunking strategy, grounding/citations, basic offline eval sets.",
  },
  {
    topic: "AI & ML Systems",
    tier: "Intermediate",
    stage: "technical",
    prompt: (focus) =>
      `How do you design a hybrid retrieval and reranking pipeline in ${focus} that balances recall, latency, and token cost?`,
    rubricHint: "Dense + sparse retrieval, metadata filtering, caching, latency budgets.",
  },
  {
    topic: "AI & ML Systems",
    tier: "Senior",
    stage: "technical",
    prompt: (focus) =>
      `Design an evaluation and guardrail framework for a production ${focus} system to detect regressions, prompt injection, and model drift.`,
    rubricHint: "Golden datasets, automated rubric graders, fallback routing, observability.",
  },
  {
    topic: "AI & ML Systems",
    tier: "Staff",
    stage: "technical",
    prompt: (focus) =>
      `Architect a high-volume multi-tenant ${focus} inference platform with strict p95 latency SLAs, cost attribution, and safe model rollouts.`,
    rubricHint: "Batching/vLLM throughput, semantic caching, shadow deployments, quota governance.",
  },

  // Managerial / Operational
  {
    topic: "General",
    tier: "Foundational",
    stage: "managerial",
    prompt: (focus) =>
      `Tell me about a time you received critical code-review or debugging feedback on ${focus}. How did you incorporate it?`,
    rubricHint: "Growth mindset, clear communication, concrete follow-through.",
  },
  {
    topic: "General",
    tier: "Intermediate",
    stage: "managerial",
    prompt: (focus) =>
      `Describe a time a production issue affected ${focus} right before a deadline. How did you triage, communicate status, and prevent recurrence?`,
    rubricHint: "Incident calm, root-cause analysis, blameless postmortem actions.",
  },
  {
    topic: "General",
    tier: "Senior",
    stage: "managerial",
    prompt: (focus) =>
      `Describe a production incident where a retry storm or cascading failure degraded ${focus}. How did you isolate the blast radius and align stakeholders?`,
    rubricHint: "Severity triage, graceful degradation, architectural remediation.",
  },
  {
    topic: "General",
    tier: "Staff",
    stage: "managerial",
    prompt: (focus) =>
      `Tell me about a high-stakes architectural disagreement around ${focus} across senior teams. How did you drive consensus and measure the outcome?`,
    rubricHint: "RFC rigor, data-backed persuasion, organizational alignment.",
  },
];

export function generateAdaptiveMockQuestions(
  config: InterviewConfig,
  skills: SkillItem[]
): AdaptiveQuestion[] {
  const tier = config.difficultyTier;
  const primaryTopic = config.primaryTopics[0] || "Backend & APIs";
  const secondaryTopic = config.primaryTopics[1] || primaryTopic;
  const focusPrimary =
    config.focusAreas[0] || skills[0]?.name || primaryTopic;
  const focusSecondary =
    config.focusAreas[1] || skills[1]?.name || secondaryTopic;

  const pickTemplate = (
    topic: string,
    stage: "icebreaker" | "technical" | "managerial"
  ): QuestionTemplate => {
    return (
      QUESTION_TEMPLATES.find(
        (q) => q.topic === topic && q.tier === tier && q.stage === stage
      ) ||
      QUESTION_TEMPLATES.find(
        (q) => q.topic === "Backend & APIs" && q.tier === tier && q.stage === stage
      ) ||
      QUESTION_TEMPLATES.find(
        (q) => q.topic === "General" && q.tier === tier && q.stage === stage
      )!
    );
  };

  const iceTpl = pickTemplate("General", "icebreaker");
  const tech1Tpl = pickTemplate(primaryTopic, "technical");
  const tech2Tpl = pickTemplate(secondaryTopic, "technical");
  const mgrTpl = pickTemplate("General", "managerial");

  return [
    {
      id: "ADAPT-ICE-1",
      stage: "icebreaker",
      topic: primaryTopic,
      difficulty: tier,
      prompt: iceTpl.prompt(focusPrimary),
      rubricHint: iceTpl.rubricHint,
    },
    {
      id: "ADAPT-TECH-1",
      stage: "technical",
      topic: primaryTopic,
      difficulty: tier,
      prompt: tech1Tpl.prompt(focusPrimary),
      rubricHint: tech1Tpl.rubricHint,
    },
    {
      id: "ADAPT-TECH-2",
      stage: "technical",
      topic: secondaryTopic,
      difficulty: tier,
      prompt: tech2Tpl.prompt(focusSecondary),
      rubricHint: tech2Tpl.rubricHint,
    },
    {
      id: "ADAPT-MGR-1",
      stage: "managerial",
      topic: primaryTopic,
      difficulty: tier,
      prompt: mgrTpl.prompt(focusPrimary),
      rubricHint: mgrTpl.rubricHint,
    },
  ];
}

export function evaluateAdaptiveAnswer(
  question: AdaptiveQuestion,
  answer: string,
  config: InterviewConfig
): AdaptiveEvaluation {
  const trimmed = answer.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const lower = trimmed.toLowerCase();

  // Check technical signal density
  const signalKeywords = [
    "latency",
    "throughput",
    "trade-off",
    "tradeoff",
    "index",
    "cache",
    "retry",
    "backoff",
    "idempotent",
    "partition",
    "consistency",
    "scale",
    "monitor",
    "metric",
    "rollback",
    "isolation",
    "security",
    "async",
    "queue",
    "bottleneck",
    "schema",
    "testing",
    "slo",
  ];
  const matchedSignals = signalKeywords.filter((kw) => lower.includes(kw));

  const lengthBonus = Math.min(2.2, wordCount / 22);
  const signalBonus = Math.min(2.0, matchedSignals.length * 0.45);
  const tierFactor = config.difficultyNumeric >= 3 ? 0.2 : 0.4;

  const relevance = Math.min(
    9.8,
    Math.round((6.6 + lengthBonus * 0.8 + signalBonus * 0.6 + tierFactor) * 10) /
      10
  );
  const depth = Math.min(
    9.7,
    Math.round((6.2 + signalBonus * 1.1 + lengthBonus * 0.6) * 10) / 10
  );
  const clarity = Math.min(
    9.8,
    Math.round((6.8 + lengthBonus * 0.85 + (trimmed.includes(".") ? 0.4 : 0)) * 10) /
      10
  );
  const overall = Math.round(((relevance + depth + clarity) / 3) * 10) / 10;

  const feedbackParts: string[] = [];
  if (matchedSignals.length >= 2) {
    feedbackParts.push(
      `Strong domain vocabulary (${matchedSignals.slice(0, 3).join(", ")}) aligned with ${question.difficulty} ${question.topic} expectations.`
    );
  } else {
    feedbackParts.push(
      `Addresses the ${question.topic} prompt clearly; adding concrete operational trade-offs and failure-mode metrics will strengthen ${question.difficulty}-tier depth.`
    );
  }
  feedbackParts.push(`Rubric focus: ${question.rubricHint}`);

  return {
    relevance,
    depth,
    clarity,
    overall,
    feedback: feedbackParts.join(" "),
  };
}

export interface ExpertCuratedQuestion {
  id: string;
  topic: string;
  difficulty: string;
  relevanceScore: number;
  text: string;
}

export function generateAdaptiveExpertSuggestions(
  config: InterviewConfig,
  skills: SkillItem[]
): ExpertCuratedQuestion[] {
  const questions = generateAdaptiveMockQuestions(config, skills);
  const tierLabel = `Tier ${config.difficultyNumeric} (${config.difficultyTier})`;
  return questions.map((q, idx) => ({
    id: `Q-${idx + 1}0${config.difficultyNumeric}`,
    topic: q.topic,
    difficulty: tierLabel,
    relevanceScore: Math.max(84, 98 - idx * 4),
    text: q.prompt,
  }));
}

export interface TopicCoverageItem {
  topic: string;
  coveragePct: number;
  statusLabel: string;
  isGap: boolean;
}

export function computeTopicCoverage(
  config: InterviewConfig,
  skills: SkillItem[],
  practicedTopics: string[]
): TopicCoverageItem[] {
  const topicsToTrack = Array.from(
    new Set([
      ...config.primaryTopics,
      ...skills.slice(0, 3).map((s) => s.name),
    ])
  ).slice(0, 5);

  return topicsToTrack.map((topic, idx) => {
    const practicedCount = practicedTopics.filter(
      (pt) => pt.toLowerCase() === topic.toLowerCase()
    ).length;

    if (practicedCount >= 2) {
      return {
        topic,
        coveragePct: 100,
        statusLabel: "100% (Verified)",
        isGap: false,
      };
    }
    if (practicedCount === 1) {
      return {
        topic,
        coveragePct: 75,
        statusLabel: "75% (Practiced)",
        isGap: false,
      };
    }
    const baseline = idx === 0 ? 45 : 25;
    return {
      topic,
      coveragePct: baseline,
      statusLabel: `${baseline}% (Untested Gap)`,
      isGap: true,
    };
  });
}
