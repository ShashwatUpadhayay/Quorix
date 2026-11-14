import type {
  DifficultyTier,
  InterviewType,
  MockSessionQuestion,
  MockSessionResponse,
} from "@/lib/mongodb";

interface GenerateParams {
  interviewType: InterviewType;
  level: DifficultyTier;
  focus: string;
  durationMinutes: number;
}

export function getQuestionCountForDuration(durationMinutes: number): number {
  if (durationMinutes <= 15) return 2;
  if (durationMinutes <= 30) return 3;
  if (durationMinutes <= 45) return 4;
  return 5;
}

/**
 * Builds starter code template for coding questions
 */
function getCodeStarter(language: string, functionName: string): string {
  const lang = language.toLowerCase();
  if (lang.includes("python")) {
    return `def ${functionName}(*args, **kwargs):\n    # Write your solution here\n    pass\n`;
  }
  if (lang.includes("go") || lang === "golang") {
    return `package main\n\n// Solution implements the required logic\nfunc ${functionName}() {\n    // TODO: Implement solution\n}\n`;
  }
  if (lang.includes("java")) {
    return `public class Solution {\n    public static void main(String[] args) {\n        // Test your solution\n    }\n}\n`;
  }
  if (lang.includes("rust")) {
    return `pub fn ${functionName}() {\n    // TODO: Implement\n}\n`;
  }
  if (lang.includes("sql") || lang.includes("postgres")) {
    return `-- Write your SQL query below\nSELECT \n  -- columns\nFROM \nWHERE \nGROUP BY \nHAVING \nORDER BY ;\n`;
  }
  // Default to TypeScript / JavaScript
  return `/**\n * Solution for ${functionName}\n * @param {any} input\n * @returns {any}\n */\nexport function ${functionName}(input: any): any {\n  // TODO: Implement your solution here\n  \n}\n`;
}

/**
 * Generates tailored mock questions dynamically
 */
export function generateMockSessionQuestions({
  interviewType,
  level,
  focus,
  durationMinutes,
}: GenerateParams): MockSessionQuestion[] {
  const count = getQuestionCountForDuration(durationMinutes);
  const cleanFocus = focus.trim() || "Fullstack Software Engineering";
  const questions: MockSessionQuestion[] = [];

  const stages: Array<"warmup" | "core" | "deep_dive" | "scenario"> = [
    "warmup",
    "core",
    "deep_dive",
    "scenario",
    "core",
  ];

  if (interviewType === "coding") {
    if (level === "Foundational") {
      questions.push({
        id: "COD-FND-1",
        order: 1,
        stage: "warmup",
        prompt: `Implement a function in ${cleanFocus} that detects whether an input string is an anagram of another, ignoring case and punctuation. Analyze both time and space complexity.`,
        rubricHint:
          "Hash map character frequencies vs sort comparison. Edge cases: empty string, unicode, case insensitivity.",
        codeStarter: getCodeStarter(cleanFocus, "isAnagram"),
        constraints: [
          "Strings length <= 10^5",
          "Optimal time complexity: O(n)",
          "Optimal space complexity: O(k) where k is character set size",
        ],
        examples: [
          {
            input: 's1 = "listen", s2 = "silent"',
            output: "true",
          },
          {
            input: 's1 = "rat", s2 = "car"',
            output: "false",
          },
        ],
      });

      questions.push({
        id: "COD-FND-2",
        order: 2,
        stage: "core",
        prompt: `Write a resilient helper or custom utility in ${cleanFocus} to deep-clone a nested object or data structure without referencing the original memory addresses. Address primitive types, arrays, and nested maps.`,
        rubricHint:
          "Recursive traversal vs structuredClone. Handling null, undefined, dates, and circular references.",
        codeStarter: getCodeStarter(cleanFocus, "deepClone"),
        constraints: [
          "Do not use lossy JSON.parse(JSON.stringify()) if functions or dates exist",
          "Ensure no shallow memory leaks remain",
        ],
      });

      questions.push({
        id: "COD-FND-3",
        order: 3,
        stage: "deep_dive",
        prompt: `Given an array of integer timestamps representing event logs in ${cleanFocus}, merge overlapping intervals into contiguous time spans and return the consolidated ranges sorted chronologically.`,
        rubricHint:
          "Sorting by start interval O(n log n), then single linear pass O(n). In-place vs copy trade-offs.",
        codeStarter: getCodeStarter(cleanFocus, "mergeIntervals"),
        examples: [
          {
            input: "[[1,3],[2,6],[8,10],[15,18]]",
            output: "[[1,6],[8,10],[15,18]]",
          },
        ],
      });
    } else if (level === "Intermediate") {
      questions.push({
        id: "COD-INT-1",
        order: 1,
        stage: "warmup",
        prompt: `Implement an LRU (Least Recently Used) Cache in ${cleanFocus} with O(1) get(key) and O(1) put(key, value) operations. Walk through why your chosen underlying data structure guarantees constant time.`,
        rubricHint:
          "Hash map combined with doubly linked list. Pointer updates on access, capacity eviction when exceeding limit.",
        codeStarter: getCodeStarter(cleanFocus, "LRUCache"),
        constraints: [
          "Capacity >= 1",
          "get(key) must be strictly O(1)",
          "put(key, val) must be strictly O(1)",
        ],
      });

      questions.push({
        id: "COD-INT-2",
        order: 2,
        stage: "core",
        prompt: `Implement a concurrency-limited task queue or batch worker in ${cleanFocus} that takes an array of asynchronous tasks and executes them with a maximum concurrency limit 'K'. Ensure rejected promises are caught cleanly.`,
        rubricHint:
          "Promise pooling, worker loops, index pointers, error propagation without halting entire batch.",
        codeStarter: getCodeStarter(cleanFocus, "concurrentWorkerPool"),
        constraints: [
          "Max concurrency 'K' must never be exceeded at any instant",
          "Preserve order of results in final output array",
        ],
      });

      questions.push({
        id: "COD-INT-3",
        order: 3,
        stage: "deep_dive",
        prompt: `Implement an in-memory Rate Limiter in ${cleanFocus} supporting a sliding-window log or token-bucket algorithm per client IP/tenant key. Explain how you prevent race conditions during concurrent access.`,
        rubricHint:
          "Sliding window log timestamps vs token bucket counter. Atomic operations, memory cleanup of stale keys.",
        codeStarter: getCodeStarter(cleanFocus, "RateLimiter"),
      });

      questions.push({
        id: "COD-INT-4",
        order: 4,
        stage: "scenario",
        prompt: `Given a stream of real-time market data ticks in ${cleanFocus}, implement a data structure that returns the moving median across the last W items in O(log W) or O(1) time.`,
        rubricHint:
          "Dual heaps (max-heap for lower half, min-heap for upper half) or balanced binary search tree.",
        codeStarter: getCodeStarter(cleanFocus, "MovingMedian"),
      });
    } else {
      // Senior or Staff
      questions.push({
        id: "COD-SNR-1",
        order: 1,
        stage: "warmup",
        prompt: `Design and implement a lock-free or high-performance concurrent Ring Buffer (Circular Queue) in ${cleanFocus}. Detail memory layout, head/tail wrap-around arithmetic, and thread/event-loop safety.`,
        rubricHint:
          "Head and tail modulo operations, atomic pointers, cache-line padding, handling full vs empty buffer distinction.",
        codeStarter: getCodeStarter(cleanFocus, "ConcurrentRingBuffer"),
        constraints: [
          "Zero dynamic heap allocations during steady-state push/pop",
          "Bounded capacity",
        ],
      });

      questions.push({
        id: "COD-SNR-2",
        order: 2,
        stage: "core",
        prompt: `Implement a DAG (Directed Acyclic Graph) build & dependency execution scheduler in ${cleanFocus}. Given nodes with interdependent tasks, execute non-dependent nodes in parallel while respecting prerequisite completion. Detect cycles gracefully.`,
        rubricHint:
          "Topological sorting (Kahn's algorithm), in-degree tracking, cycle detection, parallel execution barrier.",
        codeStarter: getCodeStarter(cleanFocus, "DagScheduler"),
      });

      questions.push({
        id: "COD-SNR-3",
        order: 3,
        stage: "deep_dive",
        prompt: `Write an efficient Trie-based prefix autocomplete engine in ${cleanFocus} supporting insert(word, weight) and topK(prefix, k) searches that returns the highest-weighted completions in sub-millisecond time.`,
        rubricHint:
          "Prefix tree with pre-computed top-K buckets or min-heap at each node. Memory footprint optimization.",
        codeStarter: getCodeStarter(cleanFocus, "TrieAutocomplete"),
      });

      questions.push({
        id: "COD-SNR-4",
        order: 4,
        stage: "scenario",
        prompt: `Build a resilient Circuit Breaker state machine in ${cleanFocus} (CLOSED -> OPEN -> HALF-OPEN) with configurable failure thresholds, recovery timeouts, and probe request limits. Ensure thread safety and observability metrics.`,
        rubricHint:
          "Sliding time window for error rates, atomic state transitions, fast-failure in OPEN state, half-open canary calls.",
        codeStarter: getCodeStarter(cleanFocus, "CircuitBreaker"),
      });
    }
  } else if (interviewType === "system_design") {
    questions.push({
      id: "SD-1",
      order: 1,
      stage: "warmup",
      prompt: `Outline the high-level architecture for a distributed rate-limiting and API gateway service built around ${cleanFocus}. What are the primary latency and data consistency trade-offs?`,
      rubricHint:
        "Token bucket/leaky bucket in Redis or Envoy, local memory caching with sync, distributed clock skew.",
    });

    questions.push({
      id: "SD-2",
      order: 2,
      stage: "core",
      prompt: `Design a global notification and event dispatching system capable of sending 50 million push, email, and webhook events daily with strict priority queues and retry policies. How do you utilize ${cleanFocus} in this topology?`,
      rubricHint:
        "Message broker (Kafka/RabbitMQ/SQS), worker auto-scaling, dead-letter queues, idempotent delivery tokens, provider rate-limit handling.",
    });

    questions.push({
      id: "SD-3",
      order: 3,
      stage: "deep_dive",
      prompt: `Design a real-time collaborative document or canvas platform (similar to Google Docs or Figma) using ${cleanFocus}. Detail your conflict resolution strategy (OT vs CRDT), socket architecture, and offline sync.`,
      rubricHint:
        "WebSockets, state synchronization, CRDTs (Yjs/Automerge) vs Operational Transformation, snapshot compaction in storage.",
    });

    questions.push({
      id: "SD-4",
      order: 4,
      stage: "scenario",
      prompt: `Your core ${cleanFocus} cluster experiences a network partition between region US-East and EU-West. Walk through your consensus, partition tolerance, and reconciliation protocol to prevent split-brain writes.`,
      rubricHint:
        "CAP theorem application, leader election quorum (Raft/Paxos), read-your-writes consistency, conflict resolution strategies.",
    });
  } else if (interviewType === "behavioral") {
    questions.push({
      id: "BEH-1",
      order: 1,
      stage: "warmup",
      prompt: `Tell me about a high-impact technical decision involving ${cleanFocus} where you had to balance engineering perfectionism against an aggressive delivery deadline. How did you decide what technical debt to take on?`,
      rubricHint:
        "Pragmatism, conscious technical debt tracking, stakeholder communication, measurable business delivery.",
    });

    questions.push({
      id: "BEH-2",
      order: 2,
      stage: "core",
      prompt: `Describe a critical production incident or outage that occurred in a project you contributed to. Walk through how you identified the root cause, led or collaborated during triage, and formulated preventive safeguards.`,
      rubricHint:
        "Blameless postmortem culture, incident composure, operational telemetry, systemic prevention over quick patches.",
    });

    questions.push({
      id: "BEH-3",
      order: 3,
      stage: "deep_dive",
      prompt: `Give an example of a situation where you had a strong technical disagreement with another senior engineer or architect regarding ${cleanFocus}. How did you navigate the impasse, present data, and achieve team alignment?`,
      rubricHint:
        "Humility, data-driven persuasion (RFCs, benchmarks), disagree and commit principle, maintaining psychological safety.",
    });

    questions.push({
      id: "BEH-4",
      order: 4,
      stage: "scenario",
      prompt: `How have you mentored or upskilled junior or mid-level developers in mastering ${cleanFocus}? Describe a specific engineer's trajectory and the feedback mechanisms you utilized.`,
      rubricHint:
        "Empathetic code review, pair programming, delegating stretch opportunities, engineering culture stewardship.",
    });
  } else {
    // Technical Deep Dive
    questions.push({
      id: "TECH-1",
      order: 1,
      stage: "warmup",
      prompt: `In ${cleanFocus}, explain how memory allocation, references, and runtime execution work under the hood. What common pitfalls cause memory leaks or thread/event-loop starvation?`,
      rubricHint:
        "Stack vs heap, garbage collector mechanics (or borrow checker in Rust), closure references, event loop tick lifecycle.",
    });

    questions.push({
      id: "TECH-2",
      order: 2,
      stage: "core",
      prompt: `How does ${cleanFocus} handle asynchronous operations, concurrency, and I/O multiplexing? Walk through the internal scheduling mechanism and compare it with traditional multi-threaded models.`,
      rubricHint:
        "Epoll/kqueue, libuv event loop, goroutine M:N scheduler, virtual threads, non-blocking I/O.",
    });

    questions.push({
      id: "TECH-3",
      order: 3,
      stage: "deep_dive",
      prompt: `A high-throughput API service written in ${cleanFocus} sees p99 latency spike from 35ms to 1,400ms under 3x normal traffic. Detail your step-by-step diagnostic workflow: what profilers, metrics, and logs do you inspect first?`,
      rubricHint:
        "CPU profiling (flamegraphs), heap allocation profiler, DB connection pool contention, GC pause duration, downstream network timeouts.",
    });

    questions.push({
      id: "TECH-4",
      order: 4,
      stage: "scenario",
      prompt: `Describe how you implement resilient database transactions, caching layers, and graceful degradation in ${cleanFocus} to ensure data consistency during partial network failures.`,
      rubricHint:
        "ACID transactions, idempotency keys, cache-aside pattern, dogpiling protection (singleflight/mutex), circuit breakers.",
    });
  }

  // Slice questions to match target count for selected duration
  return questions.slice(0, count).map((q, idx) => ({
    ...q,
    order: idx + 1,
    stage: stages[idx] || "core",
  }));
}

interface EvaluateParams {
  question: MockSessionQuestion;
  userAnswer: string;
  codeSubmitted?: string;
  interviewType: InterviewType;
  level: DifficultyTier;
  focus: string;
}

/**
 * Real-time evaluator with tri-factor scoring rubric and constructive critique
 */
export function evaluateMockResponse({
  question,
  userAnswer,
  codeSubmitted,
  interviewType,
  level,
  focus,
}: EvaluateParams) {
  const combinedText = `${userAnswer} ${codeSubmitted || ""}`.trim();
  const lower = combinedText.toLowerCase();
  const wordCount = combinedText.split(/\s+/).filter(Boolean).length;

  // Domain signals
  const technicalKeywords = [
    "latency",
    "throughput",
    "concurrency",
    "memory",
    "cache",
    "index",
    "complexity",
    "o(1)",
    "o(n)",
    "o(log n)",
    "async",
    "promise",
    "goroutine",
    "thread",
    "lock",
    "mutex",
    "idempotent",
    "retry",
    "circuit breaker",
    "failure",
    "edge case",
    "test",
    "profiler",
    "benchmark",
    "trade-off",
    "tradeoff",
    "scale",
    "partition",
    "replica",
    "consistency",
    "clean",
    "contract",
    "schema",
  ];

  const matchedKeywords = technicalKeywords.filter((kw) =>
    lower.includes(kw)
  );

  const lengthSignal = Math.min(2.4, wordCount / 28);
  const keywordSignal = Math.min(2.2, matchedKeywords.length * 0.35);

  const hasCode = !!codeSubmitted && codeSubmitted.trim().length > 25;
  const codeBonus = interviewType === "coding" && hasCode ? 0.8 : 0;

  const tierBonus =
    level === "Staff" ? 0.3 : level === "Senior" ? 0.4 : 0.6;

  // Compute 3 rubric dimensions (Relevance, Depth, Clarity)
  const relevance = Math.min(
    9.8,
    Math.round((6.8 + lengthSignal * 0.6 + keywordSignal * 0.7 + codeBonus) * 10) /
      10
  );

  const depth = Math.min(
    9.7,
    Math.round(
      (6.2 +
        keywordSignal * 1.1 +
        (hasCode ? 0.7 : 0) +
        (combinedText.includes("trade-off") || combinedText.includes("tradeoff")
          ? 0.5
          : 0)) *
        10
    ) / 10
  );

  const clarity = Math.min(
    9.8,
    Math.round(
      (7.0 +
        lengthSignal * 0.65 +
        (combinedText.includes("\n") ? 0.3 : 0) +
        tierBonus) *
        10
    ) / 10
  );

  const overall =
    Math.round(((relevance + depth + clarity) / 3) * 10) / 10;

  // Feedback generation
  const feedbackItems: string[] = [];

  if (interviewType === "coding") {
    if (hasCode) {
      feedbackItems.push(
        `Code structure provided for ${focus} aligns well with the prompt requirements.`
      );
    } else {
      feedbackItems.push(
        `Good algorithmic reasoning; providing an executable code snippet directly in the editor will demonstrate hands-on fluency.`
      );
    }
  }

  if (matchedKeywords.length >= 3) {
    feedbackItems.push(
      `Strong technical terminology demonstrated (${matchedKeywords
        .slice(0, 3)
        .join(", ")}).`
    );
  } else {
    feedbackItems.push(
      `Solid response; explicitly mentioning time/space complexities and failure modes would raise the depth to a strong ${level} tier.`
    );
  }

  feedbackItems.push(`Rubric focus: ${question.rubricHint}`);

  return {
    scores: {
      relevance,
      depth,
      clarity,
      overall,
    },
    feedback: feedbackItems.join(" "),
  };
}

/**
 * Computes overall session dossier and summary feedback
 */
export function generateSessionSummary(
  responses: MockSessionResponse[],
  interviewType: InterviewType,
  focus: string,
  level: DifficultyTier
) {
  if (responses.length === 0) {
    return {
      overallScore: 0,
      categoryScores: { relevance: 0, depth: 0, clarity: 0 },
      summaryFeedback: "Session ended with no responses submitted.",
    };
  }

  const sumRelevance = responses.reduce((acc, r) => acc + r.scores.relevance, 0);
  const sumDepth = responses.reduce((acc, r) => acc + r.scores.depth, 0);
  const sumClarity = responses.reduce((acc, r) => acc + r.scores.clarity, 0);
  const sumOverall = responses.reduce((acc, r) => acc + r.scores.overall, 0);

  const n = responses.length;
  const relevance = Math.round((sumRelevance / n) * 10) / 10;
  const depth = Math.round((sumDepth / n) * 10) / 10;
  const clarity = Math.round((sumClarity / n) * 10) / 10;
  const overallScore = Math.round((sumOverall / n) * 10) / 10;

  const typeLabels: Record<InterviewType, string> = {
    coding: "Coding & Algorithmic",
    technical: "Technical Architecture & Systems",
    system_design: "System Design & Distributed Scalability",
    behavioral: "Techno-Behavioral & Leadership",
  };

  const summaryFeedback =
    overallScore >= 8.5
      ? `Exceptional demonstration of ${typeLabels[interviewType]} skills in ${focus}. Candidate showed solid technical depth, clean communication, and systematic trade-off analysis suitable for ${level} engineering standards.`
      : overallScore >= 7.0
        ? `Strong performance across ${typeLabels[interviewType]} fundamentals for ${focus}. Candidate effectively communicated core concepts; deepening concrete operational telemetry and production edge-case handling will elevate overall confidence.`
        : `Foundational competency demonstrated in ${focus}. Recommended focus areas: structured reasoning, explicit time/space trade-offs, and diving into production-grade failure scenarios.`;

  return {
    overallScore,
    categoryScores: {
      relevance,
      depth,
      clarity,
    },
    summaryFeedback,
  };
}
