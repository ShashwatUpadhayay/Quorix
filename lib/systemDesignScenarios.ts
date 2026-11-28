import { ScenarioCard, DifficultyTier } from "./mongodb";

export const SCENARIO_CARDS: ScenarioCard[] = [
  {
    id: "sd-rate-limiter",
    title: "Distributed API Rate Limiter",
    topic: "Backend & Distributed Systems",
    tags: ["backend", "distributed_systems", "caching", "redis", "concurrency", "security", "api"],
    difficulty: "Intermediate",
    scaleTier: "hyperscale",
    brief:
      "Design a distributed API rate limiter service to protect internal microservices from abuse, DDoS traffic, and cascading failure across multi-region deployment.",
    hiddenRequirements: {
      functional: [
        "Throttle requests exceeding configured thresholds per user ID, IP address, or API token.",
        "Return HTTP 429 Too Many Requests with standard Retry-After and X-RateLimit headers.",
        "Support configurable rules per endpoint tier (e.g., 100 req/min for free, 5,000 req/min for enterprise).",
        "Config changes must propagate dynamically to all enforcement nodes within 5 seconds without server reboots.",
      ],
      nonFunctional: [
        "Sub-2ms latency overhead added to incoming traffic.",
        "High availability (99.999% uptime): the rate limiter must fail open if the limiter cluster degrades, rather than blocking legitimate users.",
        "Distributed synchronization with minimal lock contention across instances.",
        "Accurate sliding window counter without boundary spikes.",
      ],
      scale: {
        dau: "50,000,000 active clients",
        readsPerSec: "1,000,000 QPS global peak",
        writesPerSec: "1,000,000 QPS (every request updates counters)",
        storagePerYear: "Few tens of gigabytes active memory for token buckets/sliding windows",
        bandwidth: "1 Gbps control plane telemetry",
        notes: "Extreme throughput with sub-millisecond in-memory operations required.",
      },
      hiddenConstraints: [
        "Global edge locations across US, EU, and APAC with cross-region latency of 80ms.",
        "Prevent race conditions (read-modify-write) on counter updates across multiple edge proxies.",
        "Client IP spoofing must be mitigated via verified X-Forwarded-For or TLS client certificate binding.",
      ],
    },
    expectedComponents: [
      "Client",
      "API Gateway / Reverse Proxy",
      "Rate Limiter Middleware / Daemon",
      "Distributed Cache (Redis Cluster / Memcached)",
      "Rules Configuration Store (PostgreSQL / DynamoDB)",
      "Configuration Sync Engine (Kafka / Redis PubSub / Etcd)",
      "Metrics & Audit Pipeline",
    ],
    deepDiveTopics: [
      {
        topic: "Algorithm Choice: Token Bucket vs Sliding Window Log vs Sliding Window Counter",
        probeQuestion:
          "Which rate limiting algorithm do you pick, and how does your choice balance memory consumption against boundary spike accuracy?",
        keyTradeoffs: [
          "Token bucket is memory efficient (2 numbers per key) but allows burst at bucket capacity.",
          "Sliding log is perfectly accurate but memory-prohibitive under high traffic (stores all timestamps).",
          "Sliding window counter approximates window based on previous window weight with minimal memory.",
        ],
      },
      {
        topic: "Concurrency & Race Conditions in Redis",
        probeQuestion:
          "When multiple parallel requests arrive at different gateway nodes for the same user, how do you prevent race conditions without slow global locks?",
        keyTradeoffs: [
          "Redis Lua scripts execute atomically in single-threaded context.",
          "Local in-memory token batching (e.g. reserve 100 tokens per local node) trades slight limit precision for order-of-magnitude lower network hops.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Redis cluster partition or primary node crash",
        challenge: "What happens when your distributed Redis cluster becomes unreachable or undergoes election?",
        expectedHandling:
          "Fail-open policy with local in-memory fallback counters or circuit breaker so live business traffic is not dropped.",
      },
      {
        trigger: "10x traffic spike from automated botnet attack",
        challenge: "A distributed botnet hammers the login endpoint from 200,000 IPs with 10x traffic.",
        expectedHandling:
          "Hierarchical rate limiting (IP-level + subnet-level + global endpoint cap), GeoIP blocking, and CAPTCHA challenge delegation.",
      },
    ],
    tradeoffs: [
      "Accuracy vs Performance (strict global counter vs decentralized local batching)",
      "Fail-open vs Fail-closed (availability vs security guarantee)",
    ],
    sampleArchitectureHints: [
      "Client -> Cloudflare/Envoy Gateway -> Local Rate Limiter Cache -> Redis Cluster via Lua Script",
    ],
  },
  {
    id: "sd-url-shortener",
    title: "Global Scalable URL Shortener",
    topic: "Backend & Storage",
    tags: ["backend", "storage", "caching", "sql", "nosql", "distributed_systems"],
    difficulty: "Foundational",
    scaleTier: "high",
    brief:
      "Design a high-scale URL shortener service (like TinyURL or Bitly) that converts long URLs into short 7-character aliases and performs high-speed redirection with click analytics.",
    hiddenRequirements: {
      functional: [
        "Generate unique short alias (e.g., https://qrx.link/aB9x2Z) from long URL.",
        "HTTP 301 vs 302 redirection from short URL to original destination.",
        "Custom aliases supported (if not already taken).",
        "Optional link expiration time (default 5 years).",
        "Basic click count and geolocation tracking.",
      ],
      nonFunctional: [
        "Redirection latency under 10ms (p99).",
        "Extreme read-heavy workload (100:1 read-to-write ratio).",
        "100% URL availability with no single point of failure.",
        "Short links must not be easily guessable (anti-enumeration).",
      ],
      scale: {
        dau: "100,000,000 active users",
        writesPerSec: "1,200 new URLs/sec",
        readsPerSec: "120,000 redirects/sec",
        storagePerYear: "1.2k * 86400 * 365 = 38 billion URLs/yr (~15 TB storage/yr with metadata)",
        bandwidth: "Read: 120,000 * 500 bytes = 60 MB/sec; Write: 1,200 * 500 bytes = 600 KB/sec",
      },
      hiddenConstraints: [
        "Prevent duplicate short URLs for identical long URLs based on user account context.",
        "Link deletions and takedowns must invalidate caches globally within 30 seconds.",
      ],
    },
    expectedComponents: [
      "Client",
      "CDN / Edge Caching",
      "Load Balancer",
      "URL Service / API Gateway",
      "Key Generation Service (KGS) or SnowFlake / Base62 Encoder",
      "Distributed Cache (Redis / Memcached)",
      "Primary Database (NoSQL Document Store or Sharded PostgreSQL)",
      "Message Queue (Kafka / RabbitMQ for analytics)",
      "Analytics Worker & Data Warehouse (ClickHouse / BigQuery)",
    ],
    deepDiveTopics: [
      {
        topic: "ID & Short Hash Generation (Base62 vs MD5 vs KGS)",
        probeQuestion:
          "How do you generate a unique 7-character alias without collisions when multiple app servers write simultaneously?",
        keyTradeoffs: [
          "MD5/SHA-256 hash has collisions and requires truncation plus DB uniqueness check.",
          "Auto-increment 64-bit ID converted to Base62 (62^7 = 3.5 trillion URLs) is collision-free.",
          "Pre-generated Key Generation Service (KGS) using two tables (used & unused keys) avoids runtime counter synchronization.",
        ],
      },
      {
        topic: "HTTP 301 Permanent vs HTTP 302 Temporary Redirect",
        probeQuestion:
          "Should your redirection respond with HTTP 301 or HTTP 302, and what impact does that have on click analytics?",
        keyTradeoffs: [
          "HTTP 301 is cached by browser, minimizing backend load but bypassing click analytics.",
          "HTTP 302 passes every click through the server for accurate tracking at the cost of higher query load.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Celebrity tweet causes 500,000 QPS on a single URL",
        challenge: "A viral link gets hit with half a million requests a second in 2 minutes.",
        expectedHandling:
          "CDN edge caching (Cloudflare/Fastly) with short TTL or Redis read-replicas with hot-key protection.",
      },
      {
        trigger: "Database write primary fails",
        challenge: "The primary database instance fails during peak link creation hours.",
        expectedHandling:
          "Automatic failover to replica; read redirects continue seamlessly from cache and read-replicas without downtime.",
      },
    ],
    tradeoffs: [
      "Base62 auto-increment vs Pre-generated KGS (counter coordination vs pre-allocated token buffer)",
      "301 Permanent Redirect vs 302 Temporary Redirect (CDN/browser offload vs exact analytics telemetry)",
    ],
    sampleArchitectureHints: [
      "Client -> CDN -> Load Balancer -> Web App -> Redis Cache (LRU 20% hot links) -> Sharded DB",
    ],
  },
  {
    id: "sd-recsys-pipeline",
    title: "Real-Time ML Recommendation & Feature Pipeline",
    topic: "ML, Data & Streaming",
    tags: ["ml", "data", "streaming", "kafka", "embeddings", "vector_search", "python"],
    difficulty: "Staff",
    scaleTier: "hyperscale",
    brief:
      "Design an enterprise-grade real-time recommendation system (like TikTok or Netflix homepage) that computes personalized recommendations combining offline batch models, vector similarity, and real-time streaming user engagement signals.",
    hiddenRequirements: {
      functional: [
        "Serve personalized feed of 20 items per request within 50ms latency.",
        "Incorporate implicit feedback (watch time, skips, scrolls, likes) into recommendations within 2 seconds.",
        "Candidate generation (retrieval) filtering from 100M catalog down to 1,000 items, followed by heavy ranking model.",
        "Deduplication to prevent showing recently seen or dismissed items.",
      ],
      nonFunctional: [
        "Sub-50ms p99 inference and ranking latency.",
        "Handle cold-start problem for newly published content and new users.",
        "High availability (99.99%) with graceful degradation to trending/popular items if vector index lags.",
        "Model freshness: online scoring with weights updated daily, feature vectors updated in near-real-time.",
      ],
      scale: {
        dau: "250,000,000 daily active users",
        readsPerSec: "80,000 recommendation requests/sec peak",
        writesPerSec: "500,000 user interaction events/sec",
        storagePerYear: "100M items with 256-dim embeddings = 100GB vector memory; User history ~500TB/yr",
      },
      hiddenConstraints: [
        "Candidate generation must explore multi-interests (diversity vs relevance balance).",
        "Real-time feature store must support point-in-time correctness to prevent data leakage during training.",
      ],
    },
    expectedComponents: [
      "Client App",
      "API Gateway",
      "Recommendation Orchestration Service",
      "Vector Database / Approximate Nearest Neighbor Index (Milvus / Qdrant / FAISS)",
      "Real-Time Event Stream (Apache Kafka / Redpanda)",
      "Stream Processing Engine (Apache Flink / Spark Streaming)",
      "Online Feature Store (Feast / Redis / Cassandra)",
      "ML Model Inference Server (Triton / TorchServe)",
      "Offline Training & Data Lake (S3 + Snowflake / Iceberg)",
      "Cache (Redis for pre-computed candidate lists)",
    ],
    deepDiveTopics: [
      {
        topic: "Two-Stage Architecture: Candidate Retrieval vs Re-ranking",
        probeQuestion:
          "Why is it impractical to run your deep neural network ranking model across the entire 100M item catalog, and how do you structure the stages?",
        keyTradeoffs: [
          "Stage 1 (Retrieval): Cheap ANN vector search + heuristic filtering pulls 1,000 candidates in 10ms.",
          "Stage 2 (Ranking): Heavy multi-task DNN scores 1,000 candidates with rich contextual features in 25ms.",
          "Stage 3 (Re-ranking/Diversity): Apply business rules, deduplication, and exploration bandits.",
        ],
      },
      {
        topic: "Real-Time Streaming Feature Ingestion",
        probeQuestion:
          "How do you update a user's recent engagement features (e.g., last 5 video tags watched in the past 60 seconds) so the next swipe reflects them?",
        keyTradeoffs: [
          "Kafka + Apache Flink aggregates sliding window metrics and pushes to in-memory online feature store (Redis).",
          "Client-side session context payload can bypass server stream delay for instantaneous signals.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Vector database latency spikes to 300ms",
        challenge: "The ANN vector cluster experiences index compaction lag and latency degrades.",
        expectedHandling:
          "Circuit breaker falls back to pre-computed offline candidate pools + popular trending items cache within SLA.",
      },
      {
        trigger: "Cold start content surge (breaking news video)",
        challenge: "A breaking news event generates a new item with zero historical interaction data.",
        expectedHandling:
          "Multi-armed bandit exploration (Epsilon-greedy/Thompson sampling) + content-based embedding matching (NLP/vision).",
      },
    ],
    tradeoffs: [
      "Real-time online inference vs Pre-computed batch feeds (freshness vs compute cost)",
      "Model complexity vs Latency budget (deep transformer vs lightweight cross-network)",
    ],
    sampleArchitectureHints: [
      "Client -> Recs Gateway -> Retrieval (ANN Vector DB) -> Feature Store -> Triton Ranking -> Business Re-ranker",
    ],
  },
  {
    id: "sd-notification-system",
    title: "Omnichannel Notification & Alert Engine",
    topic: "Backend & Distributed Queues",
    tags: ["backend", "distributed_systems", "queues", "kafka", "microservices", "pubsub"],
    difficulty: "Intermediate",
    scaleTier: "high",
    brief:
      "Design a resilient, omnichannel notification platform (Push, SMS, Email, In-app) capable of dispatching billions of transactional and marketing notifications with user preference enforcement and rate limiting.",
    hiddenRequirements: {
      functional: [
        "Support multi-channel delivery: iOS APNs, Android FCM, SMS (Twilio), Email (SendGrid/SES).",
        "User notification preferences (opt-outs per category like Marketing, Security, Social).",
        "Deduplication (prevent duplicate notifications within a 5-minute window).",
        "Template management with dynamic localization and placeholder interpolation.",
      ],
      nonFunctional: [
        "Transactional alerts (OTP, Security) must deliver within 5 seconds p99.",
        "Marketing campaigns can be deferred or smoothed over hours.",
        "Extensible to new channels without rewriting core routing logic.",
        "Idempotency across provider retries to guarantee at-least-once delivery without spamming.",
      ],
      scale: {
        dau: "100,000,000 users",
        writesPerSec: "50,000 notifications/sec during breaking news campaigns",
        readsPerSec: "20,000 in-app notification queries/sec",
        storagePerYear: "365 days retention of delivery logs = ~200 TB compressed in cold storage",
      },
      hiddenConstraints: [
        "Third-party providers (APNs, Twilio) enforce strict API rate limits and experience transient outages.",
        "Quiet hours enforcement (e.g. do not send promotional SMS between 10 PM and 8 AM in recipient's local timezone).",
      ],
    },
    expectedComponents: [
      "Client & Producer Services",
      "API Gateway",
      "Notification Ingestion Service",
      "User Preference & Template Cache (Redis)",
      "Metadata Database (PostgreSQL / DynamoDB)",
      "Priority Message Queues (Kafka / RabbitMQ / SQS partitioned by channel & priority)",
      "Channel Dispatch Workers (APNs Worker, SMS Worker, Email Worker)",
      "Third-Party Gateways (Twilio, APNs, FCM, SES)",
      "Delivery Status & Analytics Pipeline",
    ],
    deepDiveTopics: [
      {
        topic: "Priority Queuing & Traffic Isolation",
        probeQuestion:
          "If marketing sends a 50-million recipient campaign blast, how do you prevent critical password reset OTP emails from being queued behind it?",
        keyTradeoffs: [
          "Separate queues and dedicated worker pools for High Priority (Transactional/Security) vs Low Priority (Marketing/Bulk).",
          "Weighted fair queuing or strict priority scheduling.",
        ],
      },
      {
        topic: "Deduplication & Idempotency",
        probeQuestion:
          "How do you ensure a network retry doesn't bill a user twice or send two SMS messages for the same trigger event?",
        keyTradeoffs: [
          "Idempotency keys hashed from (userId, eventType, timestampWindow) stored in Redis with TTL.",
          "Atomic Redis SETNX or DB conditional write.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Twilio SMS provider complete regional outage",
        challenge: "Twilio returns 500 errors or times out for all SMS requests.",
        expectedHandling:
          "Automatic dead-letter queue routing with circuit breaker and dynamic failover to secondary SMS provider (e.g., Sinch/MessageBird).",
      },
      {
        trigger: "Quiet hours timezone queue backlog",
        challenge: "Millions of promotional messages queue up waiting for 8:00 AM local time in a large timezone.",
        expectedHandling:
          "Delayed delivery scheduled tasks (Kafka delayed topic or Redis sorted set) with token bucket egress smoothing.",
      },
    ],
    tradeoffs: [
      "Single multi-channel queue vs Dedicated per-channel queues (operational complexity vs head-of-line blocking prevention)",
      "At-least-once with client deduplication vs Exactly-once delivery overhead",
    ],
    sampleArchitectureHints: [
      "Producer -> Ingestion API -> Redis Dedupe -> Priority Kafka Topic -> Dedicated Channel Workers -> Third-party APIs",
    ],
  },
  {
    id: "sd-chat-whatsapp",
    title: "Real-Time Chat & Presence System",
    topic: "Real-Time & Networking",
    tags: ["real_time", "websockets", "distributed_systems", "caching", "nosql", "redis"],
    difficulty: "Senior",
    scaleTier: "hyperscale",
    brief:
      "Design a real-time messaging and user presence platform (like WhatsApp or Slack) supporting 1-on-1 chats, group messaging up to 1,000 members, read receipts, and online status indicators.",
    hiddenRequirements: {
      functional: [
        "1-on-1 direct messaging and group messaging up to 1,000 participants.",
        "Real-time message delivery with typing indicators, sent, delivered, and read status ticks.",
        "Online / offline / last seen presence detection.",
        "Offline message queueing and synchronization when user reconnects.",
      ],
      nonFunctional: [
        "End-to-end message delivery latency < 100ms when both users are online.",
        "Message order must be strictly preserved per conversation.",
        "Scale to 50 million concurrent persistent WebSocket connections.",
        "Zero message loss (at-least-once delivery guarantee).",
      ],
      scale: {
        dau: "200,000,000 active users",
        readsPerSec: "1,000,000 messages/sec peak",
        writesPerSec: "100,000 sent messages/sec",
        storagePerYear: "100k msg/sec * 100 bytes * 86400 * 365 = ~315 TB/year compressed message archive",
      },
      hiddenConstraints: [
        "Stateful WebSocket connections require smart routing: server A needs to deliver a message to user on server B.",
        "Mobile clients disconnect frequently due to network switching (Wi-Fi to 4G). Reconnect storms must not crash the gateways.",
      ],
    },
    expectedComponents: [
      "Client Apps (iOS/Android/Web)",
      "TCP / WebSocket Load Balancer (AWS NLB / Envoy)",
      "Stateful Chat Gateway Cluster (WebSocket / gRPC servers)",
      "User Presence Service & Session Registry (Redis Cluster)",
      "Message Router / PubSub (Kafka / Redis PubSub / NATS)",
      "Conversation & Message Store (Cassandra / ScyllaDB / DynamoDB)",
      "Offline Push Notification Worker",
      "Media Storage (S3 / Blob storage with CDN)",
    ],
    deepDiveTopics: [
      {
        topic: "Routing Between Stateful WebSocket Servers",
        probeQuestion:
          "User Alice is connected to Gateway-1 and sends a message to Bob, who is connected to Gateway-42. How does the system route Alice's message to Bob in real-time?",
        keyTradeoffs: [
          "Session Registry in Redis maps `userId -> gateway_instance_ip`.",
          "PubSub message broker where each gateway subscribes to events for its active local clients.",
          "Direct gRPC peer-to-peer dispatch from Gateway-1 to Gateway-42.",
        ],
      },
      {
        topic: "Message Ordering & Database Partitioning",
        probeQuestion:
          "How do you design your Cassandra/NoSQL primary key to ensure messages in a conversation are always retrieved in chronological order without race conditions?",
        keyTradeoffs: [
          "Partition key `conversation_id`, clustering key `message_id` (Snowflake ID / ULID or TimeUUID) ordered ASC/DESC.",
          "Single sequence counter per chat guarantees strict linear ordering.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Gateway server holding 100,000 active WebSocket connections crashes",
        challenge: "A cluster node abruptly dies, dropping 100k active TCP sockets simultaneously.",
        expectedHandling:
          "Clients use exponential backoff + jitter to reconnect to healthy nodes; Session Registry cleans stale heartbeat entries.",
      },
      {
        trigger: "Celebrity broadcasts in 100,000 user group chat",
        challenge: "A message in a massive group triggers 100,000 deliveries at once.",
        expectedHandling:
          "Fanout on read or dedicated distributed message queues per large channel, offloading delivery tracking.",
      },
    ],
    tradeoffs: [
      "WebSockets vs Long Polling/HTTP2 (duplex low-overhead socket vs stateless scaling)",
      "Heartbeat frequency vs Redis presence write load (instant accuracy vs network/DB chatter)",
    ],
    sampleArchitectureHints: [
      "Client -> NLB -> WebSocket Gateway -> Redis Session Lookup -> Cassandra DB -> Push Worker if offline",
    ],
  },
  {
    id: "sd-video-streaming",
    title: "Large-Scale Video On-Demand Streaming",
    topic: "Media & Distributed Systems",
    tags: ["media", "video", "cdn", "streaming", "storage", "distributed_systems"],
    difficulty: "Senior",
    scaleTier: "hyperscale",
    brief:
      "Design a global Video On-Demand platform (like YouTube or Netflix) supporting video uploads, adaptive bitrate transcoding (HLS/DASH), multi-region CDN distribution, and video player analytics.",
    hiddenRequirements: {
      functional: [
        "Creators can upload high-resolution videos (up to 4K, 10GB).",
        "Asynchronous video processing pipeline: validation, transcoding into 1080p, 720p, 480p, 360p, chunking (HLS .m3u8 and .ts files).",
        "Adaptive Bitrate Streaming (ABR): player dynamically adjusts stream quality based on client network bandwidth.",
        "Thumbnail generation, video search metadata, and view counter.",
      ],
      nonFunctional: [
        "Instant playback start (< 1.5s video startup time globally).",
        "Minimal buffering / rebuffering ratio (< 0.5% of sessions).",
        "Storage cost optimization: cold videos stored on cheap tiers, hot videos cached at CDN edge.",
        "Lossless upload processing with resumable multipart chunk uploads.",
      ],
      scale: {
        dau: "150,000,000 daily viewers",
        readsPerSec: "500,000 concurrent video playback streams",
        writesPerSec: "500 hours of video uploaded every minute (~2,000 uploads/sec)",
        storagePerYear: "Petabytes of raw video and transcoded chunks annually",
      },
      hiddenConstraints: [
        "95% of video views are concentrated on 5% of content (Pareto distribution).",
        "Uploads from flaky mobile connections must support chunked resumable upload protocols (TUS protocol).",
      ],
    },
    expectedComponents: [
      "Client Video Player",
      "API Gateway / Upload API",
      "Object Storage for Raw Uploads (S3 / GCS)",
      "Transcoding Queue & Pipeline (Kafka / SQS + GPU Worker Cluster)",
      "Transcoded Chunk Storage (S3 / Distributed File System)",
      "Global CDN (Cloudflare / Akamai / AWS CloudFront)",
      "Metadata Database (PostgreSQL / CockroachDB)",
      "View Count Aggregator (Kafka + Redis / Flink)",
    ],
    deepDiveTopics: [
      {
        topic: "Adaptive Bitrate Streaming (HLS vs DASH) & Chunking",
        probeQuestion:
          "Explain how HLS segmenting works and how the video player transitions between 1080p and 480p mid-stream without interrupting audio/video playback.",
        keyTradeoffs: [
          "Master manifest lists sub-manifests for each resolution/bitrate. Audio and video chunks (typically 2-6 seconds) align on keyframes (IDR frames).",
          "Smaller chunk sizes yield faster quality switching but higher HTTP request overhead.",
        ],
      },
      {
        topic: "CDN Multi-Tier Caching Architecture",
        probeQuestion:
          "How do you organize your caching layers between edge CDNs, regional origin shields, and S3 object stores to avoid crushing the origin storage?",
        keyTradeoffs: [
          "Edge CDN handles 90%+ of hot video chunks.",
          "Regional origin shield aggregates edge cache misses.",
          "Object storage only serves requests for cold tails.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "GPU transcoding cluster overload during peak upload hours",
        challenge: "Massive influx of uploads creates a 6-hour transcoding backlog.",
        expectedHandling:
          "Priority transcoding (transcode 360p/720p first to allow immediate viewing; process 4K in background queue).",
      },
      {
        trigger: "Primary CDN vendor experiences outage in a major continent",
        challenge: "The primary CDN provider goes dark across Europe.",
        expectedHandling:
          "Multi-CDN strategy with DNS latency routing (Route53 / NS1) dynamically shifting traffic to secondary CDN.",
      },
    ],
    tradeoffs: [
      "Pre-transcoding all resolutions vs Just-in-time on-demand transcoding for cold videos",
      "Short video chunks (fast ABR switch) vs Long chunks (better video compression ratio)",
    ],
    sampleArchitectureHints: [
      "Client Upload -> S3 Raw -> Event -> Transcoding Queue -> GPU Workers -> S3 Processed -> Multi-CDN -> Player",
    ],
  },
  {
    id: "sd-rideshare-dispatch",
    title: "Real-Time Geospatial Ride Dispatching",
    topic: "Geospatial & Distributed Systems",
    tags: ["geospatial", "real_time", "algorithms", "redis", "distributed_systems", "kafka"],
    difficulty: "Staff",
    scaleTier: "hyperscale",
    brief:
      "Design the core geospatial dispatch and location tracking engine for a ride-sharing service (like Uber or Lyft) that tracks millions of moving drivers, matches riders to nearby available drivers, and calculates ETAs.",
    hiddenRequirements: {
      functional: [
        "Drivers stream GPS location updates every 4 seconds.",
        "Riders request rides specifying pickup and destination coordinates.",
        "Matching engine finds top N nearest eligible drivers within a radius and batches dispatch offers.",
        "ETA calculation and dynamic surge pricing based on supply/demand balance in geographic cells.",
      ],
      nonFunctional: [
        "Location ingest latency < 100ms.",
        "Match query response < 1 second.",
        "High geospatial write throughput with zero database deadlocks.",
        "Location consistency: avoid dispatching the same driver to two riders simultaneously.",
      ],
      scale: {
        dau: "20,000,000 active riders and 2,000,000 active drivers",
        writesPerSec: "2,000,000 drivers / 4s = 500,000 location updates/sec",
        readsPerSec: "50,000 nearby driver view / match queries/sec",
      },
      hiddenConstraints: [
        "Road network topology means Euclidean distance != driving distance (need routing graph / OSRM / Valhalla).",
        "Geographic boundaries and cell resolution must scale dynamically between dense downtown areas and sparse rural zones.",
      ],
    },
    expectedComponents: [
      "Driver & Rider Mobile Apps",
      "Geospatial Ingestion Gateway (gRPC / Netty)",
      "Location Ingestion Stream (Apache Kafka)",
      "In-Memory Geospatial Index (Uber H3 / Google S2 / Redis GEO)",
      "Dispatch & Matchmaker Service (Go / Rust microservice)",
      "ETA & Routing Engine (OSRM / GraphHopper)",
      "Trip State Machine & Ledger DB (PostgreSQL / Spanner)",
      "Surge Pricing Engine (Flink streaming aggregation)",
    ],
    deepDiveTopics: [
      {
        topic: "Geospatial Indexing: H3 Hexagons vs Geohash vs QuadTree",
        probeQuestion:
          "Which spatial indexing structure do you choose for driver location, and why are hexagons (H3) preferred over rectangular Geohashes for neighbor searching?",
        keyTradeoffs: [
          "Hexagonal cells (Uber H3) have invariant distance to all 6 adjacent neighbors; square/geohash cells have distortion at corners.",
          "Hierarchical indexing enables easy zoom-level aggregation for surge pricing calculation.",
        ],
      },
      {
        topic: "Driver Locking & Double Dispatch Prevention",
        probeQuestion:
          "When multiple match requests execute in the same neighborhood, how do you prevent two riders from matching the same driver?",
        keyTradeoffs: [
          "Distributed lock (Redis Redlock) on `driver_id` during the 15-second dispatch offer window.",
          "State machine with atomic compare-and-swap (CAS) in trip state store.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "New Year's Eve midnight surge in downtown Manhattan",
        challenge: "100x surge in ride requests with massive driver contention in a 2-mile radius.",
        expectedHandling:
          "Batch matching optimization (bipartite matching via Hungarian/Hopcroft-Karp algorithm) every 5-10 seconds rather than first-come-first-served.",
      },
      {
        trigger: "Driver app GPS jitter / indoor tunnel loss",
        challenge: "Driver location updates jump erratically or freeze in tunnels.",
        expectedHandling:
          "Kalman filtering for dead reckoning, map-matching against known road graphs, and stale driver eviction after 30s silence.",
      },
    ],
    tradeoffs: [
      "Greedy dispatch (instant match to closest) vs Batch optimization (global wait time minimization across all pending riders)",
      "Precise road network routing vs Straight-line heuristic filtering",
    ],
    sampleArchitectureHints: [
      "Driver GPS -> Ingest Gateway -> Kafka -> In-Memory H3 Index -> Matchmaker Service -> Trip Ledger DB",
    ],
  },
  {
    id: "sd-flash-sale",
    title: "E-Commerce Flash Sale & Inventory Reservation",
    topic: "Fintech & High Concurrency",
    tags: ["backend", "ecommerce", "concurrency", "transactions", "redis", "sql"],
    difficulty: "Senior",
    scaleTier: "high",
    brief:
      "Design an e-commerce inventory reservation and checkout system for high-demand flash sales (like Black Friday or Ticketmaster drops) that prevents overselling, enforces 10-minute cart locks, and handles extreme write bursts.",
    hiddenRequirements: {
      functional: [
        "Item inventory decreases atomically when user reserves; holds for 10 minutes.",
        "If checkout completes, reservation converts to confirmed purchase.",
        "If user abandons or 10-minute timer expires, inventory automatically returns to available pool.",
        "Strict guarantee: inventory can NEVER oversell (available count >= 0 always).",
      ],
      nonFunctional: [
        "Handle 100,000 reservation attempts/second on 1,000 limited items.",
        "ACID consistency for financial checkout and order confirmation.",
        "Sub-100ms response time for reservation API.",
        "Graceful degradation when payment gateways throttle.",
      ],
      scale: {
        dau: "10,000,000 concurrent shoppers during flash event",
        writesPerSec: "100,000 checkout/reserve requests/sec at exact drop second (00:00:00)",
        storagePerYear: "Few GB active stock; Orders archive ~50 TB",
      },
      hiddenConstraints: [
        "Direct SQL `UPDATE inventory SET count = count - 1 WHERE id = ? AND count > 0` will lock row and cause connection pool exhaustion.",
        "Payment provider takes 3-7 seconds to confirm webhook, requiring resilient async handling.",
      ],
    },
    expectedComponents: [
      "Client Web & Mobile App",
      "Virtual Waiting Room / Queue (Cloudflare Waiting Room / Token Issuer)",
      "API Gateway / Rate Limiter",
      "Flash Sale Ingestion Service",
      "In-Memory Inventory Engine (Redis Cluster with Lua Scripts)",
      "Delayed Reservation Expiration Queue (Redis Sorted Set / RabbitMQ TTL + Dead Letter)",
      "Order Database (PostgreSQL / CockroachDB with optimistic locking)",
      "Payment Processing Worker & Webhook Ingest",
    ],
    deepDiveTopics: [
      {
        topic: "Preventing Database Row Lock Contention on Hot Items",
        probeQuestion:
          "If 50,000 concurrent threads try to decrement the same database inventory row, the DB collapses on row locks. How do you design the reservation layer?",
        keyTradeoffs: [
          "Pre-load inventory into Redis memory and decrement via atomic Lua script `redis.call('DECR', key)`. DB write is deferred until checkout.",
          "Inventory bucket sharding: split 1,000 items into 10 sub-buckets of 100 to parallelize DB locks.",
        ],
      },
      {
        topic: "Handling 10-Minute Cart Expiration Cleanly",
        probeQuestion:
          "How do you implement the 10-minute expiration so unsold items return to stock immediately without polling the database every second?",
        keyTradeoffs: [
          "Redis Sorted Set with score = `expiration_timestamp` polled by lightweight worker.",
          "RabbitMQ / SQS message with TTL routed to a Dead-Letter Exchange (DLX) that rolls back the reservation.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Payment Gateway webhook never arrives",
        challenge: "Payment processor charges customer credit card but fails to deliver the webhook confirmation callback.",
        expectedHandling:
          "Reconciliation worker polls payment gateway status API for pending transactions before expiring cart reservation.",
      },
      {
        trigger: "Redis cluster fails after 800 items reserved",
        challenge: "Redis node restarts and loses last 2 seconds of in-memory reservations.",
        expectedHandling:
          "Redis AOF (Append-Only File) `fsync everysec` + DB transaction log reconciliation to reconstruct state.",
      },
    ],
    tradeoffs: [
      "Pessimistic DB lock vs In-memory Redis pre-deduction (strict single source of truth vs ultra-high throughput)",
      "First-come-first-served vs Virtual randomized waiting room queue",
    ],
    sampleArchitectureHints: [
      "Client -> Waiting Room -> API Gateway -> Redis Lua DECR -> Delayed Queue -> Order DB -> Payment Gateway",
    ],
  },
  {
    id: "sd-news-feed",
    title: "Social News Feed & Fanout Architecture",
    topic: "Social Networks & Caching",
    tags: ["social", "caching", "pubsub", "databases", "nosql", "redis", "distributed_systems"],
    difficulty: "Senior",
    scaleTier: "hyperscale",
    brief:
      "Design a social network news feed system (like Twitter or Instagram) where users can post status updates, follow other accounts, and view a chronologically or algorithmically sorted home feed of posts from people they follow.",
    hiddenRequirements: {
      functional: [
        "Users can publish posts (text, image URLs).",
        "Users can follow/unfollow other users.",
        "Users can fetch their home timeline (latest 20 posts from followed users).",
        "Support high-follower accounts ('celebrities' with 50M+ followers).",
      ],
      nonFunctional: [
        "Feed load latency < 200ms.",
        "New post appears on followers' feeds within 5 seconds.",
        "Read-to-write ratio of roughly 100:1 (heavy reading, fast scrolling).",
      ],
      scale: {
        dau: "300,000,000 daily active users",
        readsPerSec: "300,000 feed requests/sec",
        writesPerSec: "5,000 new posts/sec",
        storagePerYear: "5,000 * 500 bytes * 86400 * 365 = ~78 TB text metadata/year",
      },
      hiddenConstraints: [
        "Fanout-on-write (push) for an account with 80 million followers causes massive write amplification and delay.",
        "Fanout-on-read (pull) for inactive users wastes zero write IOPS.",
      ],
    },
    expectedComponents: [
      "Client App",
      "API Gateway",
      "Post Service",
      "Social Graph Service (Followers DB - Neo4j / Graph / PostgreSQL)",
      "Fanout Service & Queue (Kafka)",
      "Feed Cache (Redis Sorted Sets storing post IDs per user timeline)",
      "Post Storage Database (Cassandra / DynamoDB)",
      "Media CDN",
    ],
    deepDiveTopics: [
      {
        topic: "Fanout-on-Write (Push) vs Fanout-on-Read (Pull) vs Hybrid",
        probeQuestion:
          "Explain the trade-offs between pushing posts to every follower's timeline cache on write vs pulling posts when a user opens the app, and how a hybrid approach solves the celebrity problem.",
        keyTradeoffs: [
          "Push: Blazing fast feed read (O(1) from Redis list), but posting takes forever for celebrities with millions of followers.",
          "Pull: Instant posting, but reading requires querying all followed users and merging lists (slow read).",
          "Hybrid: Push for normal users (< 25k followers); Pull on-the-fly for celebrity posts and merge at read time.",
        ],
      },
      {
        topic: "Feed Cache Structure in Redis",
        probeQuestion:
          "What Redis data structure do you use to store a user's pre-computed timeline, and how do you handle pagination?",
        keyTradeoffs: [
          "Redis Sorted Set (`ZSET`) where value is `post_id` and score is `created_timestamp`.",
          "Supports `ZREVRANGEBYSCORE` for cursor-based pagination without deep offset performance penalties.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Celebrity posts breaking news and 10 million followers refresh simultaneously",
        challenge: "A massive thundering herd hits the pull merge layer for the celebrity's post.",
        expectedHandling:
          "Cache the celebrity's recent posts in a high-concurrency Redis cluster with local memory caching at the gateway layer.",
      },
      {
        trigger: "Fanout message queue backs up during major global event",
        challenge: "Kafka fanout topic partition lags by 15 minutes.",
        expectedHandling:
          "Autoscale fanout worker pool, prioritize active users (who opened app in last 24h), drop fanout for dormant accounts.",
      },
    ],
    tradeoffs: [
      "Push model vs Pull model (write amplification vs read latency)",
      "Chronological ordering vs Machine-learned relevance ranking score",
    ],
    sampleArchitectureHints: [
      "Client -> Gateway -> Post Service -> Kafka -> Fanout Worker -> Redis Timeline ZSET -> Client Read",
    ],
  },
  {
    id: "sd-kv-store",
    title: "Distributed Key-Value Store",
    topic: "Distributed Systems & Storage",
    tags: ["distributed_systems", "storage", "databases", "concurrency", "algorithms"],
    difficulty: "Staff",
    scaleTier: "hyperscale",
    brief:
      "Design a highly available, fault-tolerant distributed key-value storage engine (similar to Amazon DynamoDB or Apache Cassandra) supporting get(key) and put(key, value) with tunable consistency.",
    hiddenRequirements: {
      functional: [
        "Core operations: `put(key, value)` and `get(key)`.",
        "Automatic horizontal data partitioning across dozens of nodes.",
        "Configurable replication factor (e.g., N=3 replicas).",
        "Tunable consistency levels: Quorum reads (R) and writes (W).",
      ],
      nonFunctional: [
        "High availability for writes (CAP theorem: prioritize AP with eventual consistency).",
        "Sub-10ms read/write latency at p99.",
        "Automatic partition rebalancing when adding/removing cluster nodes.",
        "Conflict resolution for concurrent divergent writes.",
      ],
      scale: {
        dau: "10,000,000,000 keys stored",
        writesPerSec: "100,000 writes/sec",
        readsPerSec: "500,000 reads/sec",
        storagePerYear: "Petabytes distributed across SSD storage nodes",
      },
      hiddenConstraints: [
        "Network partitions (split-brain) can cause two replicas to receive divergent writes simultaneously.",
        "Single-node storage engine must write fast without random I/O thrashing.",
      ],
    },
    expectedComponents: [
      "Client Driver with Partition-Aware Router",
      "Coordinator Node",
      "Storage Node Cluster (LSM-Tree / RocksDB engine per node)",
      "Consistent Hashing Ring with Virtual Nodes",
      "Gossip Protocol Cluster Membership Detector",
      "Vector Clocks / Last-Write-Wins Conflict Resolver",
      "Anti-Entropy Background Sync (Merkle Trees)",
      "Hinted Handoff Buffer for Temporary Node Outages",
    ],
    deepDiveTopics: [
      {
        topic: "Consistent Hashing with Virtual Nodes",
        probeQuestion:
          "How does consistent hashing prevent massive key reshuffling when adding a new node, and why are virtual nodes necessary?",
        keyTradeoffs: [
          "Consistent hashing only moves K/N keys when cluster membership changes.",
          "Virtual nodes (vnodes) prevent hot spots and distribute key load uniformly across physical machines of different capacities.",
        ],
      },
      {
        topic: "Tunable Consistency (R + W > N) & Vector Clocks",
        probeQuestion:
          "Explain how setting R=2, W=2 on an N=3 cluster guarantees strong consistency, and what happens when R + W <= N.",
        keyTradeoffs: [
          "If R + W > N, read set overlaps write set by pigeonhole principle, guaranteeing reading latest value.",
          "If R + W <= N, low latency and high availability at expense of reading stale data.",
          "Vector clocks track causal history to identify concurrent conflicts.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Temporary network partition disconnects 1 of 3 replica nodes",
        challenge: "A storage node is unreachable for 5 minutes during writes.",
        expectedHandling:
          "Hinted handoff: coordinator saves write in local buffer and replays it when replica recovers.",
      },
      {
        trigger: "Silent replica bit rot / divergence over months",
        challenge: "Replicas slowly diverge due to dropped messages during long partitions.",
        expectedHandling:
          "Read repair (on read mismatch) + background anti-entropy sync using Merkle trees to find differing ranges without transferring entire datasets.",
      },
    ],
    tradeoffs: [
      "LSM-Tree (fast write, slow read, periodic compaction) vs B-Tree (fast read, slow random write)",
      "Last-Write-Wins (simple, wall-clock drift risk) vs Vector Clocks (preserves causality, requires client merge logic)",
    ],
    sampleArchitectureHints: [
      "Client -> Consistent Hash Ring -> Coordinator Node -> Replicas (LSM Storage Engine) -> Gossip Protocol",
    ],
  },
  {
    id: "sd-web-crawler",
    title: "Distributed Scalable Web Crawler",
    topic: "Data & Distributed Systems",
    tags: ["data", "crawling", "networking", "distributed_systems", "algorithms", "queues"],
    difficulty: "Intermediate",
    scaleTier: "hyperscale",
    brief:
      "Design a distributed web crawler (like Googlebot) capable of crawling 1 billion web pages per month, extracting content and links, obeying robots.txt politeness rules, and deduplicating pages.",
    hiddenRequirements: {
      functional: [
        "Crawl URLs from a frontier queue and download HTML/media.",
        "Extract text and outgoing links; feed new URLs back into the frontier.",
        "Strictly obey robots.txt and rate-limit requests per domain (politeness).",
        "Detect and skip duplicate or near-duplicate web pages (e.g., mirrors, query string noise).",
      ],
      nonFunctional: [
        "Throughput: ~400 pages/second continuous crawl.",
        "Robustness against spider traps (infinite loops like calendar links).",
        "Distributed architecture across hundreds of worker nodes.",
        "Domain DNS resolution must not become a bottleneck.",
      ],
      scale: {
        dau: "1 billion pages crawled per month",
        storagePerYear: "1B * 100KB HTML = 100 TB raw storage per month (~1.2 PB/year in S3 / HDFS)",
        bandwidth: "400 pages/sec * 100 KB = 40 MB/sec ingress network bandwidth",
      },
      hiddenConstraints: [
        "DNS lookup overhead per URL can add 50-200ms latency without a dedicated caching DNS tier.",
        "Politeness: never send more than 1 request per second to any single host domain.",
      ],
    },
    expectedComponents: [
      "Seed URLs Loader",
      "URL Frontier (Priority Queues + Politeness Queues)",
      "DNS Resolver Cache Cluster",
      "HTML Fetcher Workers",
      "Robots.txt Cache (Redis)",
      "Content Parser & Link Extractor",
      "Duplicate Detector (SimHash / MinHash / Fingerprint store)",
      "URL Deduplication Filter (Bloom Filter)",
      "Raw Document Storage (S3 / HDFS)",
    ],
    deepDiveTopics: [
      {
        topic: "URL Frontier Architecture: Prioritization & Politeness",
        probeQuestion:
          "How do you design the URL frontier queue so high-priority news sites are crawled frequently, while never overwhelming any single web server with concurrent requests?",
        keyTradeoffs: [
          "Dual-tier queue: Priority Queues determine which page to crawl based on PageRank/freshness; Politeness Queues enforce 1 queue per hostname with delay timers.",
        ],
      },
      {
        topic: "Deduplication at Scale (Bloom Filters & SimHash)",
        probeQuestion:
          "With 5 billion discovered URLs, how do you verify if a newly extracted URL has already been visited without doing a slow database lookup on every link?",
        keyTradeoffs: [
          "In-memory Bloom Filter checks URL presence with tiny memory footprint and zero false negatives.",
          "SimHash algorithm computes 64-bit fingerprint of page content to detect near-duplicates with Hamming distance.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Crawler gets stuck in an infinite spider trap",
        challenge: "A website dynamically generates infinite URLs `/calendar?year=2024&month=1...`",
        expectedHandling:
          "URL depth limiter, path length threshold, and domain crawl quotas to automatically throttle suspicious sub-trees.",
      },
      {
        trigger: "DNS lookup latency stalls crawler threads",
        challenge: "Public DNS servers throttle crawler requests after 10,000 queries/sec.",
        expectedHandling:
          "Local in-memory DNS caching daemon (e.g., Unbound/Dnsmasq) with prefetching and long TTL caching.",
      },
    ],
    tradeoffs: [
      "Breadth-First Search (BFS) vs Depth-First Search (DFS) (balanced discovery vs deep exploration)",
      "Raw HTML storage vs Extracted clean text storage (storage volume vs re-parsing flexibility)",
    ],
    sampleArchitectureHints: [
      "URL Frontier -> Politeness Queues -> Fetcher Worker -> DNS Cache -> HTML Parser -> Bloom Filter -> Storage",
    ],
  },
  {
    id: "sd-metrics-monitoring",
    title: "Real-Time Metrics & Alerting Platform",
    topic: "Time-Series & Telemetry",
    tags: ["data", "time_series", "monitoring", "streaming", "kafka", "distributed_systems"],
    difficulty: "Senior",
    scaleTier: "hyperscale",
    brief:
      "Design a real-time metrics collection, storage, and alerting infrastructure (similar to Datadog or Prometheus/Thanos) that ingests time-series metrics from 50,000 servers and triggers alerts within 5 seconds of threshold violation.",
    hiddenRequirements: {
      functional: [
        "Ingest metrics: `metric_name`, `timestamp`, `value`, `tags: { host, region, env, service }`.",
        "Query interface supporting aggregations (e.g. `sum(rate(http_requests[5m])) by (service)`).",
        "Alerting rule evaluator executing every 10 seconds against sliding time windows.",
        "Downsampling: raw data (1s) retained 7 days, 1m rollups retained 30 days, 1h rollups retained 1 year.",
      ],
      nonFunctional: [
        "Massive write-heavy workload: 10 million metric samples per second.",
        "Alert evaluation latency < 5 seconds from trigger to notification.",
        "Data compression: time-series data must compress significantly (Gorilla compression).",
        "Query dashboard render time < 1 second for 24-hour charts.",
      ],
      scale: {
        dau: "50,000 server hosts emitting 200 metrics every 1 second = 10,000,000 metrics/sec",
        storagePerYear: "10M/s * 86400 * 365 = 315 billion data points/yr (~300 TB compressed with Gorilla)",
      },
      hiddenConstraints: [
        "High cardinality tags (e.g., including user_id in metrics tags) can cause index explosion and crash the TSDB.",
      ],
    },
    expectedComponents: [
      "Metrics Collector Agent (OpenTelemetry / Telegraf on hosts)",
      "Load Balancer",
      "Ingestion Gateway",
      "Telemetry Stream (Apache Kafka)",
      "Time-Series Database Cluster (VictoriaMetrics / TimescaleDB / ClickHouse)",
      "In-Memory Cache for Recent Window (Redis / RAM buffer)",
      "Streaming Alert Evaluator (Flink / Alertmanager)",
      "Downsampling & Rollup Background Workers",
      "Notification Dispatcher (PagerDuty / Slack / Email)",
    ],
    deepDiveTopics: [
      {
        topic: "Time-Series Compression (Gorilla Algorithm)",
        probeQuestion:
          "How does Facebook's Gorilla compression algorithm compress timestamps using Delta-of-Deltas and floating-point values using XOR?",
        keyTradeoffs: [
          "Timestamps written at steady intervals compress down to 1 bit per sample.",
          "XOR floating point compression achieves 1.37 bytes per data point instead of 16 bytes.",
        ],
      },
      {
        topic: "High Cardinality Explosion",
        probeQuestion:
          "What happens to your inverted index when developers attach unique UUIDs to metric tags, and how do you protect the storage engine?",
        keyTradeoffs: [
          "Index explosion exhausts memory and kills query performance.",
          "Gateway validates and rejects/strips high-cardinality tags; logs go to log pipeline (Elasticsearch/Loki), not TSDB.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Network partition delays metric delivery by 30 seconds",
        challenge: "Metrics arrive out of order with historical timestamps.",
        expectedHandling:
          "Out-of-order ingestion buffer window (e.g. accept timestamps within 10-minute drift) before committing to immutable columnar segments.",
      },
      {
        trigger: "Alert rule evaluating 50,000 time series locks dashboard queries",
        challenge: "Heavy alert queries degrade interactive Grafana dashboards.",
        expectedHandling:
          "Separate query engine into interactive dashboard read-nodes and dedicated stream-based alerting evaluators.",
      },
    ],
    tradeoffs: [
      "Push metrics (agent pushes to gateway) vs Pull metrics (Prometheus scrapes endpoints)",
      "Exact raw data retention vs Downsampled aggregated rollups",
    ],
    sampleArchitectureHints: [
      "Host Agent -> Gateway -> Kafka -> TSDB Storage Engine + Streaming Alert Evaluator -> PagerDuty",
    ],
  },
  {
    id: "sd-payment-gateway",
    title: "Resilient Payment Processing & Ledger Engine",
    topic: "Fintech & Distributed Transactions",
    tags: ["fintech", "payments", "transactions", "ledger", "idempotency", "sql"],
    difficulty: "Staff",
    scaleTier: "high",
    brief:
      "Design an enterprise payment gateway and immutable financial ledger (like Stripe or Square) that processes card authorizations, captures, refunds, and maintains double-entry accounting with absolute zero financial discrepancy.",
    hiddenRequirements: {
      functional: [
        "Card authorization, capture, void, and refund lifecycle.",
        "Double-entry bookkeeping ledger: total debits must equal total credits for every transaction.",
        "Idempotent API: duplicate network requests with identical idempotency key must return same result without charging twice.",
        "Integration with external banking acquirers (Visa, Mastercard, Chase).",
      ],
      nonFunctional: [
        "Zero money loss, zero double-charging under any failure condition.",
        "Strict auditability: immutable ledger, no SQL `UPDATE` or `DELETE` on financial records.",
        "PCI-DSS compliance: tokenize credit card numbers, never store raw PAN in general DB.",
        "High availability (99.999%) with strong consistency for balance verification.",
      ],
      scale: {
        dau: "50,000,000 transactions/day (~1,000 transactions/sec average, 10,000/sec peak)",
        storagePerYear: "Ledger entries grow by 100M rows/year; stored with cryptographic audit hashing",
      },
      hiddenConstraints: [
        "Banking networks have unpredictable timeouts (e.g., acquirer takes 20 seconds, connection drops). Did the charge succeed or fail?",
        "Distributed transactions cannot rely on slow two-phase commit (2PC) across third-party banks.",
      ],
    },
    expectedComponents: [
      "Client Checkout SDK",
      "PCI Tokenization Vault",
      "API Gateway / Idempotency Filter",
      "Payment Orchestrator Service",
      "Idempotency Cache & Lock (Redis)",
      "Immutable Double-Entry Ledger DB (PostgreSQL / CockroachDB / Amazon QLDB)",
      "Bank Acquirer Adapter & Retry Engine",
      "Reconciliation & Settlement Worker Pipeline",
    ],
    deepDiveTopics: [
      {
        topic: "Handling Third-Party Acquirer Timeouts Safely",
        probeQuestion:
          "You send an authorization request to Visa. After 15 seconds, the HTTP connection drops with a network timeout. You don't know if Visa charged the card or not. What does your state machine do?",
        keyTradeoffs: [
          "Mark transaction as `PENDING_RECONCILIATION`.",
          "Do not retry automatically without acquirer-side idempotency reference.",
          "Query Visa's transaction status API or execute reversal/void if ambiguous.",
        ],
      },
      {
        topic: "Double-Entry Bookkeeping Ledger Design",
        probeQuestion:
          "Show how you record a $100 user payment where your platform takes a $3 fee and pays $97 to the merchant using double-entry accounting.",
        keyTradeoffs: [
          "Debits: User Receivables $100. Credits: Platform Revenue $3, Merchant Payable $97.",
          "Immutable append-only entries ensure internal auditing integrity.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Customer double-clicks 'Pay $500' button instantly",
        challenge: "Two identical charge requests hit two different server instances within 5 milliseconds.",
        expectedHandling:
          "Distributed lock on idempotency key in Redis; second request waits or returns in-progress lock / cached response.",
      },
      {
        trigger: "Database transaction fails after bank successfully charges card",
        challenge: "Acquirer returns HTTP 200, but local DB dies before saving confirmation.",
        expectedHandling:
          "Write intent log before calling bank; background reconciliation worker checks unconfirmed intent logs against acquirer settlement records.",
      },
    ],
    tradeoffs: [
      "Synchronous processing vs Asynchronous payment pipelines",
      "Pessimistic balance locking vs Optimistic balance verification with compensatory transactions (Saga pattern)",
    ],
    sampleArchitectureHints: [
      "Client -> Tokenizer Vault -> API Gateway -> Idempotency Store -> Orchestrator -> Acquirer -> Immutable Ledger DB",
    ],
  },
  {
    id: "sd-file-storage",
    title: "Cloud Object Storage & Sync Service",
    topic: "Storage & File Systems",
    tags: ["storage", "files", "cloud", "distributed_systems", "caching", "deduplication"],
    difficulty: "Intermediate",
    scaleTier: "hyperscale",
    brief:
      "Design a cloud file storage and synchronization platform (like Dropbox or Google Drive) allowing users to upload, download, and synchronize files across desktop and mobile devices with efficient bandwidth usage.",
    hiddenRequirements: {
      functional: [
        "Upload, download, delete, and view file revision history.",
        "Automatic background sync across multiple devices.",
        "Chunking: break files into 4MB blocks to support delta sync (only upload modified chunks).",
        "Conflict resolution when two devices edit the same file simultaneously.",
      ],
      nonFunctional: [
        "Efficient bandwidth: block-level deduplication across users and revisions.",
        "High durability (99.999999999% - 11 nines) for stored blocks.",
        "Fast metadata sync (< 500ms notification across devices on file change).",
        "Resumable chunk uploads for large files (up to 50GB).",
      ],
      scale: {
        dau: "50,000,000 active users",
        storagePerYear: "50M * 10GB = 500 Petabytes of storage managed",
        writesPerSec: "10,000 file sync events/sec",
      },
      hiddenConstraints: [
        "Content-addressable storage (CAS) uses SHA-256 hash of chunks as storage key to achieve global deduplication.",
      ],
    },
    expectedComponents: [
      "Desktop/Mobile Client (File Watcher + Chunking Engine)",
      "API Gateway",
      "Metadata Service (PostgreSQL / CockroachDB)",
      "Block Storage Service & Object Store (S3 / Ceph)",
      "Synchronization Service (WebSockets / Long Polling)",
      "Deduplication & Hash Registry (Redis / DynamoDB)",
      "Message Queue (Kafka for sync events)",
    ],
    deepDiveTopics: [
      {
        topic: "Block-Level Chunking & Delta Sync",
        probeQuestion:
          "If a user edits 1 line of a 1GB file, how does your system ensure you don't re-upload the entire 1GB file over the network?",
        keyTradeoffs: [
          "Fixed-size chunking (4MB) vs Content-Defined Chunking (Rabin fingerprints / FastCDC) prevents chunk shift when inserting bytes at beginning.",
          "Only modified chunks with new SHA-256 hashes are uploaded.",
        ],
      },
      {
        topic: "Concurrent Edit Conflict Resolution",
        probeQuestion:
          "Device A and Device B both edit `budget.xlsx` while offline, then both connect to Wi-Fi. How do you resolve the conflict?",
        keyTradeoffs: [
          "Last-Write-Wins (loss of data).",
          "File branching: keep both versions, create `budget (Conflicted Copy from Device B).xlsx` and notify user.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Network interruption at 98% of 20GB upload",
        challenge: "Client loses connection on the 4,990th chunk of a 5,000-chunk file.",
        expectedHandling:
          "Resumable multipart session: client queries uploaded chunk manifest and only uploads the missing 10 chunks on reconnect.",
      },
      {
        trigger: "Storage disk corruption on a block storage node",
        challenge: "A hard drive experiences bit rot on raw chunk data.",
        expectedHandling:
          "Erasure coding (e.g. Reed-Solomon 8+4) allows reconstructing lost blocks from parity chunks with 50% less overhead than 3x replication.",
      },
    ],
    tradeoffs: [
      "Fixed chunking vs Content-Defined Chunking (CDC)",
      "3x Full Replication vs Reed-Solomon Erasure Coding (storage cost vs CPU/latency reconstruction)",
    ],
    sampleArchitectureHints: [
      "Client File Watcher -> Chunk Hash Check -> Upload Missing Chunks to S3 -> Update Metadata DB -> Notify Other Clients via WS",
    ],
  },
  {
    id: "sd-search-autocomplete",
    title: "Real-Time Search Autocomplete & Typeahead",
    topic: "Search & In-Memory Data Structures",
    tags: ["search", "algorithms", "caching", "in_memory", "distributed_systems"],
    difficulty: "Intermediate",
    scaleTier: "hyperscale",
    brief:
      "Design a real-time search typeahead / autocomplete service (like Google Search Autocomplete) that returns top 5 relevant search suggestions as the user types each character within 30 milliseconds.",
    hiddenRequirements: {
      functional: [
        "As user types a query prefix (e.g. 'sys'), return top 5 completed queries ranked by historical frequency/popularity.",
        "Real-time trending queries updated hourly.",
        "Filter inappropriate or hate-speech queries.",
        "Support personalized suggestions based on user search history.",
      ],
      nonFunctional: [
        "Ultra-low latency: response time < 30ms p99 globally.",
        "Extreme read QPS: every keystroke produces a network request (debounced to ~150ms on client).",
        "Scalable prefix storage with high memory efficiency.",
      ],
      scale: {
        dau: "200,000,000 active searchers",
        readsPerSec: "100,000 autocomplete requests/sec",
        storagePerYear: "100 million unique prefix queries = ~10 GB RAM Trie index",
      },
      hiddenConstraints: [
        "Traversing a pure Trie and sorting all child nodes by popularity at runtime on every keystroke takes too long.",
      ],
    },
    expectedComponents: [
      "Client Search Box (Debounced)",
      "Edge CDN & Browser Local Cache",
      "API Gateway / Reverse Proxy",
      "Typeahead Service Cluster",
      "Trie In-Memory Index Server with Pre-Computed Top-K nodes",
      "Search Log Ingestion Stream (Kafka)",
      "Aggregation Pipeline (MapReduce / Spark / Flink) for Query Frequency",
      "Filter & Blacklist Engine",
      "Trie Snapshot Store (S3 / Persistent DB)",
    ],
    deepDiveTopics: [
      {
        topic: "Trie Optimization: Storing Pre-Computed Top 5 at Each Node",
        probeQuestion:
          "Why is a standard Trie traversal too slow for 100k QPS, and how does storing top 5 suggestions at each prefix node optimize read latency?",
        keyTradeoffs: [
          "Standard Trie requires finding prefix node, traversing entire subtree, and sorting by frequency: O(V log V).",
          "Storing top 5 pre-computed queries at each node reduces query time to O(length of prefix) = O(1) in practice, trading memory for speed.",
        ],
      },
      {
        topic: "Client-Side Caching & Keystroke Debouncing",
        probeQuestion:
          "How do client debouncing and browser local storage reduce backend traffic by over 50%?",
        keyTradeoffs: [
          "Debouncing waits 150ms after user pauses typing, skipping intermediate queries.",
          "Client-side cache stores prefixes (`s`, `sy`, `sys`), serving backspaces and repeat prefixes without network calls.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Breaking world news event changes top queries instantaneously",
        challenge: "A breaking news event occurs and users expect suggestions to reflect it within 1 minute, but batch processing runs hourly.",
        expectedHandling:
          "Fast-path real-time streaming pipeline (Flink) boosts trending queries directly into Redis overlay cache.",
      },
      {
        trigger: "Trie server crashes with 10GB in-memory tree",
        challenge: "A node hosting a partition of the Trie crashes.",
        expectedHandling:
          "Replicas serve read traffic; new instance loads pre-built serialized Trie snapshot from S3 within 30 seconds.",
      },
    ],
    tradeoffs: [
      "Pre-computed Top-K at every node vs Dynamic subtree search (higher memory vs instant lookup)",
      "Batch frequency recalculation vs Real-time streaming frequency updates",
    ],
    sampleArchitectureHints: [
      "Client Debounce -> CDN -> Typeahead API -> In-Memory Trie (Pre-computed Top 5) -> Fast Path Trending Cache",
    ],
  },
  {
    id: "sd-collaborative-doc",
    title: "Real-Time Collaborative Document Editing",
    topic: "Collaborative Editing & Concurrency",
    tags: ["real_time", "websockets", "algorithms", "crdt", "concurrency", "distributed_systems"],
    difficulty: "Staff",
    scaleTier: "high",
    brief:
      "Design a real-time collaborative document editing system (like Google Docs or Notion) where multiple users simultaneously edit text, see live multi-cursor positions, and converge on identical document state without merge conflicts.",
    hiddenRequirements: {
      functional: [
        "Concurrent multi-user text editing with real-time character-by-character synchronization.",
        "Live presence displaying other users' cursor positions and selections.",
        "Document revision history and undo/redo operations.",
        "Offline editing support: edits made while offline seamlessly merge upon reconnection.",
      ],
      nonFunctional: [
        "Sub-50ms synchronization latency between connected clients.",
        "Strong eventual consistency: all clients must converge on the exact same document state.",
        "Zero data loss under simultaneous conflicting keystrokes.",
      ],
      scale: {
        dau: "10,000,000 active documents edited daily",
        writesPerSec: "50,000 character edits/sec",
        storagePerYear: "Full edit history and snapshots = ~100 TB",
      },
      hiddenConstraints: [
        "Centralized Operational Transformation (OT) requires a single server authority to linearize edits.",
        "Conflict-free Replicated Data Types (CRDTs) allow decentralized peer-to-peer convergence with higher memory overhead.",
      ],
    },
    expectedComponents: [
      "Client Editor Engine (ProseMirror / Monaco with CRDT/OT adapter)",
      "WebSocket Gateway",
      "Document Collaboration Server (Session Leader)",
      "Redis Session & Presence Registry",
      "Operation Stream (Kafka)",
      "Document Snapshot & Delta DB (MongoDB / DynamoDB)",
      "Version History Storage (S3 for full changelogs)",
    ],
    deepDiveTopics: [
      {
        topic: "Operational Transformation (OT) vs CRDT (Yjs / Automerge)",
        probeQuestion:
          "Compare Operational Transformation (used by Google Docs) with Conflict-free Replicated Data Types (CRDTs). Why have modern collaborative tools shifted toward CRDTs?",
        keyTradeoffs: [
          "OT requires a central server to transform operations against concurrent operations; hard to scale peer-to-peer or handle complex offline merges.",
          "CRDTs assign globally unique IDs and fractional indexes to characters, ensuring commutative convergence anywhere without central coordination, at cost of memory metadata.",
        ],
      },
      {
        topic: "Session Affinity and Sticky WebSockets",
        probeQuestion:
          "All users editing Document #123 should ideally connect to the same collaboration server. How do you route and manage this?",
        keyTradeoffs: [
          "Consistent hashing on `document_id` routes all collaborators to the same server node.",
          "Redis PubSub can sync servers if collaborators span multiple gateway instances.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Collaboration server handling 50 active doc sessions crashes",
        challenge: "Server process dies abruptly in the middle of active editing sessions.",
        expectedHandling:
          "Clients hold local edit buffers, reconnect to standby node via document hash, and re-transmit unacknowledged edit deltas.",
      },
      {
        trigger: "User goes offline for 3 days and reconnects with 500 local edits",
        challenge: "Large divergent offline edits must merge into a document that has changed significantly.",
        expectedHandling:
          "CRDT causal order merges local operations cleanly with remote tree without throwing merge conflict errors.",
      },
    ],
    tradeoffs: [
      "Operational Transformation (central authority, minimal memory) vs CRDTs (decentralized, higher memory per character)",
      "Saving every keystroke vs Periodic 5-second snapshot deltas",
    ],
    sampleArchitectureHints: [
      "Client CRDT -> WebSocket -> Sticky Doc Node -> Operational Log (Kafka) -> Snapshot DB",
    ],
  },
  {
    id: "sd-event-ticketing",
    title: "High-Demand Concert Ticketing System",
    topic: "Transactions & Virtual Waiting Rooms",
    tags: ["backend", "ecommerce", "concurrency", "distributed_systems", "transactions"],
    difficulty: "Senior",
    scaleTier: "high",
    brief:
      "Design a concert ticketing platform (like Ticketmaster) for stadium tours that sells 80,000 seats in 5 minutes, supports interactive seat maps, prevents scalper bots, and enforces a strict 8-minute reservation timer.",
    hiddenRequirements: {
      functional: [
        "Interactive seat selection (showing Available, Reserved, Sold states).",
        "Reserve seat for 8 minutes during checkout; release if unpaid.",
        "Virtual queue / waiting room to absorb initial ticket drop burst.",
        "Ticket barcode generation and transfer prevention mechanisms.",
      ],
      nonFunctional: [
        "Prevent seat double-booking under extreme concurrency.",
        "Scalper bot protection: CAPTCHA verification, device fingerprinting, and max 4 tickets per person.",
        "High availability during ticket drop with predictable throughput.",
      ],
      scale: {
        dau: "2,000,000 fans waiting for 80,000 seats at 10:00 AM",
        writesPerSec: "15,000 seat lock attempts/sec",
      },
      hiddenConstraints: [
        "Interactive seat map queries must not hammer the transactional database.",
      ],
    },
    expectedComponents: [
      "Client Web App",
      "Virtual Waiting Room (Queue-IT / Cloudflare)",
      "API Gateway & Bot Detector",
      "Seat Map Cache (Redis Bitmap / Spatial representation)",
      "Reservation Lock Manager (Redis Redlock / DB optimistic locking)",
      "Ticketing Core Transactional DB (PostgreSQL with Serializable isolation)",
      "Payment Gateway Integration",
    ],
    deepDiveTopics: [
      {
        topic: "Virtual Waiting Room Mechanics",
        probeQuestion:
          "How does a virtual waiting room protect the downstream reservation system from 2 million simultaneous shoppers?",
        keyTradeoffs: [
          "Users arriving before drop are placed in a holding room; at drop time, queue positions are randomly assigned (defeats bots).",
          "Admit users into checkout in controlled batches (e.g. 500 users/second) matching DB transaction capacity.",
        ],
      },
      {
        topic: "Seat Reservation State Machine",
        probeQuestion:
          "How do you design the state transitions (`Available -> Reserved -> Purchased -> Available`) with strict timeouts?",
        keyTradeoffs: [
          "Redis Key Expiry notification or delayed message queue triggers release of unpaid seats.",
          "Atomic CAS operation `UPDATE seats SET status = 'RESERVED', user_id = ? WHERE id = ? AND status = 'AVAILABLE'`.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Database connection pool exhaustion during seat selection",
        challenge: "Thousands of users click seats simultaneously.",
        expectedHandling:
          "Admit gate throttles traffic; seat availability queries read from Redis Bitmap; only checkout writes touch PostgreSQL.",
      },
    ],
    tradeoffs: [
      "General admission vs Reserved seating complexity",
      "Immediate hold expiration vs Grace period for slow bank authorization",
    ],
    sampleArchitectureHints: [
      "Client -> Waiting Room -> Gateway -> Redis Seat Cache -> PostgreSQL Transaction -> Ticket Generator",
    ],
  },
  {
    id: "sd-iot-telemetry",
    title: "High-Throughput Connected Vehicle Telemetry Ingestion",
    topic: "IoT & Streaming",
    tags: ["iot", "streaming", "telemetry", "kafka", "time_series", "distributed_systems"],
    difficulty: "Senior",
    scaleTier: "hyperscale",
    brief:
      "Design an IoT telemetry ingestion and real-time anomaly detection system for a fleet of 5 million connected electric vehicles transmitting battery, speed, motor temperature, and diagnostics data every 2 seconds.",
    hiddenRequirements: {
      functional: [
        "Ingest sensor packets via MQTT / WebSockets from 5 million vehicles.",
        "Real-time safety alerting (e.g., battery temperature > 65°C triggers SMS alert to driver within 2 seconds).",
        "Vehicle historical trip analysis and fleet management dashboard.",
        "Over-the-Air (OTA) firmware update orchestration channel.",
      ],
      nonFunctional: [
        "Ingestion throughput: 2.5 million packets per second continuous.",
        "High availability and resilience against cellular connectivity dead zones.",
        "Data compression to minimize vehicle cellular SIM data bills.",
      ],
      scale: {
        dau: "5,000,000 active connected vehicles",
        writesPerSec: "2,500,000 messages/sec",
        storagePerYear: "Terabytes per day; ~1 Petabyte per year compressed",
      },
      hiddenConstraints: [
        "Cellular connections are unreliable; vehicles buffer telemetry locally on flash memory and upload in bursts when reconnecting.",
      ],
    },
    expectedComponents: [
      "Vehicle Onboard Telematics Module (MQTT Client)",
      "MQTT Broker Cluster (EMQX / HiveMQ)",
      "Kafka Ingestion Pipeline",
      "Real-Time Stream Processing (Apache Flink / Spark Streaming)",
      "Time-Series Storage (ClickHouse / TimescaleDB)",
      "Device Registry & Digital Twin Store (DynamoDB / Cassandra)",
      "Alert Notification Service",
      "Cold Analytics Data Lake (S3 / Parquet)",
    ],
    deepDiveTopics: [
      {
        topic: "MQTT Protocol Efficiency for IoT",
        probeQuestion:
          "Why is MQTT with binary Protobuf payloads vastly superior to HTTP/JSON for connected vehicle telemetry?",
        keyTradeoffs: [
          "MQTT has minimal 2-byte header overhead compared to heavy HTTP headers.",
          "Persistent TCP connections eliminate TLS handshake renegotiation on cellular networks.",
          "Protobuf achieves 5x-10x compression over verbose JSON.",
        ],
      },
      {
        topic: "Handling Out-of-Order Burst Ingestion",
        probeQuestion:
          "When a vehicle exits an underground tunnel after 20 minutes, it dumps 600 buffered packets all at once. How does your stream processor handle this?",
        keyTradeoffs: [
          "Flink event-time processing with watermarks handles late-arriving data based on packet creation timestamp rather than ingestion timestamp.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Critical battery thermal runaway alert",
        challenge: "A vehicle detects dangerous battery overheating.",
        expectedHandling:
          "Fast-path streaming filter in Flink sends high-priority notification to driver and vehicle display within 500ms, bypassing batch storage.",
      },
    ],
    tradeoffs: [
      "Continuous streaming vs Batch telemetry upload (network cost vs real-time safety monitoring)",
      "Edge computing on vehicle CPU vs Cloud-only analysis",
    ],
    sampleArchitectureHints: [
      "Vehicle -> MQTT Broker -> Kafka -> Apache Flink -> ClickHouse TSDB + Alert Push Service",
    ],
  },
  {
    id: "sd-fraud-detection",
    title: "Real-Time Payment Fraud Scoring Pipeline",
    topic: "Fintech & Streaming ML",
    tags: ["fintech", "ml", "streaming", "kafka", "security", "distributed_systems"],
    difficulty: "Staff",
    scaleTier: "high",
    brief:
      "Design a real-time payment fraud detection system that analyzes transactions within 100 milliseconds, applying rule engines, graph relationship checks, and machine learning models to block fraudulent charges before authorization.",
    hiddenRequirements: {
      functional: [
        "Score each transaction (0 to 1000 fraud risk score).",
        "Deterministic rules (velocity checks, blacklist IPs, geo-impossible travel: user buys coffee in London and 10 mins later in Tokyo).",
        "ML scoring model trained on historical chargeback data.",
        "Graph analysis detecting fraud rings sharing device fingerprints or stolen cards.",
      ],
      nonFunctional: [
        "Strict latency SLA: < 100ms total pipeline time.",
        "Zero downtime: must never crash checkout; fallback to rule engine if ML model times out.",
        "False positive rate < 0.1% to avoid frustrating legitimate spenders.",
      ],
      scale: {
        dau: "100,000,000 transactions/day (~5,000 transactions/sec peak)",
      },
      hiddenConstraints: [
        "Feature aggregation (e.g. count of transactions from this card in last 10 minutes) must be computed in real-time.",
      ],
    },
    expectedComponents: [
      "Payment Service Ingest",
      "Fraud Gateway API",
      "Rule Engine (Drools / Custom Go evaluator)",
      "Real-Time Feature Aggregator (Redis / Flink)",
      "ML Model Inference Server (Triton / ONNX Runtime)",
      "Graph Database for Fraud Rings (Neo4j / Amazon Neptune)",
      "Audit Trail & Model Retraining Store (Snowflake)",
    ],
    deepDiveTopics: [
      {
        topic: "Feature Extraction Within 20ms",
        probeQuestion:
          "How do you query 50 historical features (user velocity, device history, IP risk) in parallel within 20 milliseconds?",
        keyTradeoffs: [
          "Pre-computed feature vectors in Redis cluster.",
          "Parallel asynchronous I/O retrieval using gRPC or Go goroutines.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "ML model inference latency exceeds 80ms",
        challenge: "Heavy ML model slows down due to compute node failure.",
        expectedHandling:
          "Circuit breaker skips ML model and falls back to deterministic rule engine to preserve checkout SLA.",
      },
    ],
    tradeoffs: [
      "Synchronous blocking evaluation vs Asynchronous post-charge review",
      "Complex deep model (high accuracy, high latency) vs Light gradient boosted trees (XGBoost sub-10ms)",
    ],
    sampleArchitectureHints: [
      "Payment API -> Fraud Service -> Parallel Feature Fetch -> Rules Engine -> ML Model -> Verdict (Approve/Decline/Challenge)",
    ],
  },
  {
    id: "sd-distributed-cache",
    title: "Distributed In-Memory Cache Cluster",
    topic: "Distributed Systems & In-Memory Storage",
    tags: ["distributed_systems", "caching", "memory", "redis", "concurrency"],
    difficulty: "Senior",
    scaleTier: "hyperscale",
    brief:
      "Design a distributed in-memory cache system (like Memcached or Redis Cluster) supporting get/set/delete, automated consistent hashing, master-replica replication, and memory eviction policies (LRU/LFU).",
    hiddenRequirements: {
      functional: [
        "Key-value operations: `get(key)`, `set(key, value, ttl)`, `delete(key)`.",
        "LRU / LFU cache eviction when memory limit is reached.",
        "Support multi-key operations with slot hash tags.",
        "Automatic primary-replica failover.",
      ],
      nonFunctional: [
        "Sub-millisecond latency (p99 < 1ms).",
        "High availability with automatic cluster rebalancing.",
        "No single point of failure.",
      ],
      scale: {
        dau: "10,000,000 requests/sec across 100 cache nodes",
      },
      hiddenConstraints: [
        "Memory fragmentation in C/Go runtimes can degrade performance without slab allocation.",
      ],
    },
    expectedComponents: [
      "Smart Client Driver with Slot Routing",
      "Cache Node Cluster (In-Memory Engine)",
      "Cluster Coordinator / Gossip Protocol",
      "Slab Memory Allocator",
      "LRU Doubly Linked List + Hash Map",
      "Replication Stream",
    ],
    deepDiveTopics: [
      {
        topic: "LRU Eviction Implementation in O(1)",
        probeQuestion:
          "Describe how you combine a Hash Map and a Doubly Linked List to implement an O(1) LRU eviction policy.",
        keyTradeoffs: [
          "Hash Map provides O(1) key lookup pointing to node in Doubly Linked List.",
          "Doubly Linked List allows O(1) removal and insertion to the front of the list.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Master cache node crashes",
        challenge: "Primary node for slot range 0-5460 becomes unreachable.",
        expectedHandling:
          "Replica node detects timeout via gossip heartbeats, initiates election, and promotes itself to master.",
      },
    ],
    tradeoffs: [
      "Exact LRU vs Approximated LRU sampling (Redis style - checks random 5 keys)",
      "Single-threaded event loop (Redis) vs Multi-threaded execution (Memcached)",
    ],
    sampleArchitectureHints: [
      "Smart Client -> Hash Slots (16384) -> Cache Master Node -> Async Replication to Replica",
    ],
  },
  {
    id: "sd-live-leaderboard",
    title: "Real-Time Gaming Leaderboard",
    topic: "Gaming & High-Throughput Aggregation",
    tags: ["gaming", "redis", "caching", "algorithms", "distributed_systems"],
    difficulty: "Intermediate",
    scaleTier: "high",
    brief:
      "Design a high-throughput real-time gaming leaderboard system (like in Fortnite or Call of Duty) displaying live ranks for 100 million players, global Top 100, and 'Surrounding Ranks' (+/- 5 players near your score).",
    hiddenRequirements: {
      functional: [
        "Update player score: `updateScore(userId, scoreDelta)`.",
        "Fetch global top 100 players.",
        "Fetch player's current rank and surrounding 5 players.",
        "Support seasonal and daily leaderboards with automatic resets.",
      ],
      nonFunctional: [
        "Sub-15ms query response time.",
        "Handle 50,000 score updates per second during peak tournament events.",
      ],
      scale: {
        dau: "100,000,000 registered players, 10,000,000 active tournament players",
      },
      hiddenConstraints: [
        "A single Redis Sorted Set can become CPU-bound when 50,000 score updates hit the same instance.",
      ],
    },
    expectedComponents: [
      "Game Client & Game Server",
      "API Gateway",
      "Leaderboard Service",
      "Redis Cluster with Sorted Sets (ZSET) or Distributed SkipList",
      "Score Ingestion Stream (Kafka)",
      "Persistent History DB (PostgreSQL)",
    ],
    deepDiveTopics: [
      {
        topic: "Sharding Sorted Sets by Score Range",
        probeQuestion:
          "How do you shard a 10-million player leaderboard across multiple Redis nodes without breaking rank calculations?",
        keyTradeoffs: [
          "Shard by score ranges (e.g. 0-1000 pts on Node 1, 1001-2000 on Node 2).",
          "Finding rank requires summing member counts of higher-score shards plus local rank in current shard.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Redis cluster failure at tournament end",
        challenge: "Redis crashes 1 minute before final score lock.",
        expectedHandling:
          "Kafka preserves score update event stream; replay score stream into secondary cluster.",
      },
    ],
    tradeoffs: [
      "Single massive sorted set vs Partitioned score buckets",
      "Real-time instant rank updates vs 30-second cached leaderboards",
    ],
    sampleArchitectureHints: [
      "Game Server -> Kafka -> Leaderboard Worker -> Sharded Redis ZSET -> Player Rank Query API",
    ],
  },
  {
    id: "sd-distributed-task-scheduler",
    title: "Distributed Task Scheduler & Job Queue",
    topic: "Workflows & Distributed Scheduling",
    tags: ["distributed_systems", "queues", "scheduling", "concurrency", "backend"],
    difficulty: "Senior",
    scaleTier: "high",
    brief:
      "Design a distributed cron and task scheduler (like Temporal, Airflow, or Celery) capable of scheduling and executing millions of recurring and delayed jobs with at-least-once execution and failure retry policies.",
    hiddenRequirements: {
      functional: [
        "Schedule one-time delayed jobs and recurring cron jobs.",
        "Support task dependencies (DAG workflows).",
        "Automatic retries with exponential backoff on job failure.",
        "Worker heartbeat monitoring and re-assignment of abandoned tasks.",
      ],
      nonFunctional: [
        "Job execution precision within 1 second of scheduled time.",
        "Fault tolerance: no jobs dropped if a scheduler or worker node dies.",
        "Scale to 10,000,000 scheduled jobs per day.",
      ],
      scale: {
        dau: "10,000,000 jobs executed daily",
      },
      hiddenConstraints: [
        "Avoid race conditions where two workers pick up the same job simultaneously.",
      ],
    },
    expectedComponents: [
      "Job Submission API",
      "Scheduler Master Nodes (Leader election via Raft/Etcd)",
      "Delayed Job Store (Redis Sorted Set / PostgreSQL / Kafka Delayed)",
      "Distributed Message Queue (RabbitMQ / SQS)",
      "Worker Pool Cluster",
      "Job Execution State Store & History DB",
    ],
    deepDiveTopics: [
      {
        topic: "Delayed Execution Store Architecture",
        probeQuestion:
          "How does the scheduler find jobs due right now without scanning millions of database records?",
        keyTradeoffs: [
          "Redis ZSET with score = `execute_timestamp`. Schedulers poll `ZRANGEBYSCORE 0 {current_timestamp}` and dispatch due jobs to queue.",
          "Hierarchical timing wheel algorithm for memory-efficient time-bucket scheduling.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Worker crashes mid-execution of a 10-minute task",
        challenge: "Task was running but worker died without sending completion signal.",
        expectedHandling:
          "Heartbeat timeout / visibility timeout expires; task is returned to queue and assigned to another worker.",
      },
    ],
    tradeoffs: [
      "Push dispatch to workers vs Worker pull from queue",
      "At-least-once with idempotent tasks vs Exactly-once execution lock overhead",
    ],
    sampleArchitectureHints: [
      "Job API -> PostgreSQL DB -> Scheduler Leader -> Redis Due Pool -> RabbitMQ -> Worker Cluster",
    ],
  },
  {
    id: "sd-cdn-edge-cache",
    title: "Global Content Delivery Network (CDN) & Edge Shield",
    topic: "Edge Computing & Caching",
    tags: ["cdn", "networking", "caching", "distributed_systems", "dns"],
    difficulty: "Staff",
    scaleTier: "hyperscale",
    brief:
      "Design a global Content Delivery Network (CDN) and edge reverse proxy (like Cloudflare or Fastly) with Anycast routing, multi-tier caching, origin shield protection, and dynamic purge capabilities.",
    hiddenRequirements: {
      functional: [
        "Cache static and streaming assets close to users worldwide.",
        "Instant purge API: invalidate any URL or cache tag globally in < 150ms.",
        "Origin shield: prevent millions of cache misses from overwhelming origin servers.",
        "TLS termination and HTTP/2 & HTTP/3 multiplexing at edge.",
      ],
      nonFunctional: [
        "Sub-10ms response time for cache hits.",
        "BGP Anycast routing for automatic geographic proximity.",
        "DDoS mitigation at the edge.",
      ],
      scale: {
        dau: "10,000,000 edge requests per second across 200 Points of Presence (PoPs)",
      },
      hiddenConstraints: [
        "Purging a popular key globally in milliseconds across 200 PoPs requires a reliable pub-sub mesh.",
      ],
    },
    expectedComponents: [
      "Anycast DNS / BGP Routing Tier",
      "Edge PoP Proxy Servers (Nginx / Envoy / Rust proxy)",
      "In-Memory & NVMe Edge Cache Tier",
      "Regional Origin Shield Tier",
      "Global Purge Mesh (NATS / Kafka)",
      "Origin Customer Web Servers",
    ],
    deepDiveTopics: [
      {
        topic: "BGP Anycast Routing",
        probeQuestion:
          "How does BGP Anycast allow multiple physical PoPs around the world to share the same IP address, and what happens if a PoP goes down?",
        keyTradeoffs: [
          "BGP routes client packets to the topologically closest router announcing the IP prefix.",
          "If a PoP fails, BGP withdraws route announcement and traffic instantly re-routes to next closest PoP.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Cache stampede / Thundering herd on origin server",
        challenge: "An un-cached asset expires and 50,000 requests hit the edge at the exact same millisecond.",
        expectedHandling:
          "Request collapsing / Mutex lock: edge proxy makes only 1 request to origin and streams response to all 50,000 waiting clients.",
      },
    ],
    tradeoffs: [
      "Origin Shield vs Direct Origin Fetch (extra hop latency vs origin protection)",
      "TTL expiration vs Active purge API invocation",
    ],
    sampleArchitectureHints: [
      "Client -> BGP Anycast -> Edge PoP -> Origin Shield -> Customer Origin Server",
    ],
  },
  {
    id: "sd-crypto-exchange-orderbook",
    title: "High-Frequency Exchange Matching Engine & Order Book",
    topic: "Fintech & Ultra-Low Latency Systems",
    tags: ["fintech", "concurrency", "algorithms", "in_memory", "networking"],
    difficulty: "Staff",
    scaleTier: "high",
    brief:
      "Design an ultra-low-latency financial matching engine and order book (like Binance or Nasdaq) that matches limit and market orders in sub-millisecond time with strict price-time priority.",
    hiddenRequirements: {
      functional: [
        "Order types: Limit orders, Market orders, Cancel orders.",
        "Price-time priority matching (FIFO at each price level).",
        "Real-time order book broadcast (L2/L3 market data feeds via WebSocket).",
        "Deterministic audit log for full replayability.",
      ],
      nonFunctional: [
        "Matching engine execution latency < 500 microseconds (p99).",
        "Zero data loss, 100% deterministic order matching.",
        "High throughput: 100,000 orders/sec per trading pair.",
      ],
      scale: {
        dau: "100,000 orders/sec peak per trading pair",
      },
      hiddenConstraints: [
        "Zero garbage collection pauses: standard Java/Go garbage collector pauses will violate microsecond SLAs.",
      ],
    },
    expectedComponents: [
      "Client Trading Gateway (FIX Protocol / WebSocket)",
      "Risk & Account Balance Pre-Check Engine",
      "Single-Threaded In-Memory Matching Engine (C++ / Rust / LMAX Disruptor Java)",
      "Order Book Data Structure (B-Tree of Price Points + Doubly Linked List of Orders)",
      "Sequencer & Event Log (Raft / Aeron messaging)",
      "Market Data Broadcast Gateway",
      "Settlement & Trade Clearing Engine",
    ],
    deepDiveTopics: [
      {
        topic: "Single-Threaded In-Memory Matching vs Multi-Threaded",
        probeQuestion:
          "Why is the core matching engine for a single trading pair almost always designed as single-threaded in memory rather than multi-threaded with locks?",
        keyTradeoffs: [
          "Single-threaded execution eliminates lock contention, cache misses, and context switching overhead.",
          "Guarantees deterministic execution order and zero race conditions on the order book.",
        ],
      },
    ],
    failureScenarios: [
      {
        trigger: "Matching engine server process crashes",
        challenge: "Engine process terminates while holding order book state in RAM.",
        expectedHandling:
          "Standby replica consumes identical deterministic event log in lockstep and takes over immediately; or restart and replay snapshot + append log.",
      },
    ],
    tradeoffs: [
      "Synchronous persistence vs In-memory sequencer replay",
      "Full depth-of-book broadcast vs Top-of-book L2 aggregated broadcast",
    ],
    sampleArchitectureHints: [
      "Gateway -> Sequencer -> Matching Engine (In-Memory Order Book) -> Trade Output Stream -> Market Data WS",
    ],
  },
];

/**
 * Retrieve a scenario card by ID
 */
export function getScenarioById(id: string): ScenarioCard | undefined {
  return SCENARIO_CARDS.find((card) => card.id === id);
}

/**
 * Tailor and select the best scenario card for a candidate based on:
 * - Candidate profile tags and skills (e.g., ML, backend, distributed systems)
 * - Preferred difficulty tier (Foundational, Intermediate, Senior, Staff)
 * - Focus area / framework / domain
 */
export function selectScenarioForCandidate(
  tags: string[] = [],
  difficulty: DifficultyTier = "Intermediate",
  focus?: string
): ScenarioCard {
  const normalizedTags = tags.map((t) => t.toLowerCase().trim());
  const normalizedFocus = (focus || "").toLowerCase().trim();

  // Score each scenario card based on tag overlap, focus match, and difficulty match
  const scored = SCENARIO_CARDS.map((card) => {
    let score = 0;

    // Difficulty matching
    if (card.difficulty === difficulty) {
      score += 15;
    } else if (
      (difficulty === "Staff" && card.difficulty === "Senior") ||
      (difficulty === "Senior" && card.difficulty === "Intermediate") ||
      (difficulty === "Foundational" && card.difficulty === "Intermediate")
    ) {
      score += 8;
    }

    // Focus matching
    if (normalizedFocus) {
      if (card.title.toLowerCase().includes(normalizedFocus)) score += 25;
      if (card.topic.toLowerCase().includes(normalizedFocus)) score += 20;
      if (card.tags.some((t) => t.includes(normalizedFocus) || normalizedFocus.includes(t))) score += 15;
    }

    // Tag overlap
    for (const tag of card.tags) {
      if (normalizedTags.includes(tag)) {
        score += 10;
      }
    }

    // Specific domain preferences
    const isMlCandidate = normalizedTags.some((t) => t.includes("ml") || t.includes("ai") || t.includes("python") || t.includes("data"));
    if (isMlCandidate && (card.id === "sd-recsys-pipeline" || card.id === "sd-fraud-detection")) {
      score += 30;
    }

    const isBackendCandidate = normalizedTags.some((t) => t.includes("backend") || t.includes("sql") || t.includes("api") || t.includes("redis"));
    if (isBackendCandidate && (card.id === "sd-rate-limiter" || card.id === "sd-url-shortener" || card.id === "sd-flash-sale")) {
      score += 20;
    }

    return { card, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.card || SCENARIO_CARDS[0];
}
