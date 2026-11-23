import os
import random
import re
from dataclasses import asdict, dataclass, field
from hashlib import sha1
from math import sqrt
from typing import Iterable

from .ollama import OllamaClient, OllamaError
from .gemini import GeminiClient, GeminiError


STAGES = ("icebreaker", "technical", "techno_managerial")

DOMAINS = {
    "Backend & APIs": ("backend", "api", "node", "fastapi", "express", "rest", "grpc"),
    "Databases & Storage": ("postgres", "sql", "mongodb", "redis", "database", "prisma"),
    "Distributed Systems": ("kafka", "distributed", "raft", "microservice", "consensus"),
    "Frontend & UI": ("react", "next", "frontend", "css", "typescript", "accessibility"),
    "Cloud & DevOps": ("kubernetes", "docker", "terraform", "aws", "prometheus", "devops"),
    "Security & Testing": ("oauth", "security", "owasp", "jwt", "testing", "threat"),
    "Data Engineering": ("airflow", "spark", "dbt", "snowflake", "data quality", "flink"),
    "AI & ML Systems": ("rag", "llm", "machine learning", "pytorch", "embeddings", "mlops"),
    "Algorithms & Data Structures": ("algorithm", "graph", "heap", "dynamic programming", "coding"),
    "Engineering Leadership": ("leadership", "mentoring", "incident", "hiring", "strategy"),
}


@dataclass
class Profile:
    level: str = "Intermediate"
    experience_years: int = 3
    tags: list[str] = field(default_factory=list)
    primary_topics: list[str] = field(default_factory=list)
    focus_areas: list[str] = field(default_factory=list)


@dataclass
class QuestionRequest:
    session_id: str
    question_number: int = 1
    planned_question_count: int = 5
    interview_type: str = "technical"
    focus: str = ""
    domain: str | None = None
    stage: str | None = None
    target_difficulty: int | None = None
    mode: str = "auto"
    profile: Profile = field(default_factory=Profile)
    asked_question_texts: list[str] = field(default_factory=list)
    last_question: str | None = None
    last_answer: str | None = None
    last_score: float | None = None
    generation_seed: str = ""


@dataclass
class GeneratedQuestion:
    text: str
    topic: str
    subtopic: str
    difficulty: int
    stage: str
    expected_points: list[str]
    competency_tags: list[str]
    codeStarter: str | None = None
    constraints: list[str] = field(default_factory=list)
    examples: list[dict[str, str]] = field(default_factory=list)


CURATED = [
    GeneratedQuestion("Walk me through a backend service you built end to end. What did you personally own, and which production constraint shaped the design?", "Backend & APIs", "API Design & Versioning", 2, "icebreaker", ["Ownership", "Production constraint", "Trade-off", "Outcome"], ["backend", "ownership"]),
    GeneratedQuestion("A REST endpoint sometimes returns stale data immediately after an update. How would you diagnose caching, replication and read-after-write behavior?", "Backend & APIs", "REST & HTTP", 3, "technical", ["Caching headers", "Replica lag", "Read-after-write", "Observability"], ["REST", "caching", "replication"]),
    GeneratedQuestion("Your public API has a breaking change that mobile clients cannot all upgrade immediately. How would you version and roll out the change safely?", "Backend & APIs", "API Design & Versioning", 4, "technical", ["Versioning strategy", "Parallel compatibility", "Rollout", "Rollback"], ["API", "compatibility", "versioning"]),
    GeneratedQuestion("A slow PostgreSQL query is consuming database capacity. Walk through how you would identify and fix the bottleneck.", "Databases & Storage", "Indexing & Query Plans", 3, "technical", ["Execution plan", "Indexes", "Cardinality", "Measurement"], ["PostgreSQL", "query optimization"]),
    GeneratedQuestion("How would you design Kafka consumers to process events reliably when duplicate delivery is possible?", "Distributed Systems", "Messaging & Queues", 4, "technical", ["Idempotency", "Offsets", "Retries", "Ordering"], ["Kafka", "idempotency"]),
    GeneratedQuestion("A React page has become slow under frequent updates. How would you find the bottleneck and verify an improvement?", "Frontend & UI", "React Architecture", 3, "technical", ["Profiling", "Render causes", "State placement", "Metrics"], ["React", "performance"]),
    GeneratedQuestion("Kubernetes pods are becoming unavailable during deployment. How would you diagnose rollout health and prevent customer impact?", "Cloud & DevOps", "Deployment & Rollouts", 4, "technical", ["Readiness", "Rollback", "Progressive rollout", "Observability"], ["Kubernetes", "rollout"]),
    GeneratedQuestion("How would you assess the security impact of a newly discovered authentication bypass?", "Security & Testing", "Authentication", 4, "technical", ["Scope", "Exploit assessment", "Containment", "Verification"], ["security", "authentication"]),
    GeneratedQuestion("An Airflow pipeline produces late and inconsistent data. How would you improve correctness and observability?", "Data Engineering", "Pipeline Reliability", 4, "technical", ["Data lineage", "Retries", "Data quality", "SLOs"], ["Airflow", "data quality"]),
    GeneratedQuestion("How would you evaluate whether an LLM-based retrieval system is improving answer quality?", "AI & ML Systems", "LLM Evaluation", 4, "technical", ["Baseline", "Retrieval metrics", "Answer metrics", "Guardrails"], ["RAG", "evaluation"]),
    GeneratedQuestion("You need to detect a cycle in a large directed graph efficiently. Explain your approach and complexity trade-offs.", "Algorithms & Data Structures", "Graphs", 3, "technical", ["Graph representation", "Algorithm", "Complexity", "Edge cases"], ["graphs", "complexity"]),
    GeneratedQuestion("Given an integer array, return the length of the longest strictly increasing subarray.", "Algorithms & Data Structures", "Arrays", 2, "icebreaker", ["Linear traversal", "Current run", "Best run", "Edge cases"], ["arrays", "two pointers"], "function longestIncreasingSubarray(nums) {\n  // Write your solution here\n}\n", ["1 <= nums.length <= 100000", "Values may be negative", "Return 0 for an empty array"], [{"input": "nums = [1, 3, 5, 4, 7]", "output": "3", "explanation": "The longest run is [1, 3, 5]."}]),
    GeneratedQuestion("Given a binary tree and a target value, determine whether a root-to-leaf path sums to the target.", "Algorithms & Data Structures", "Trees", 3, "technical", ["DFS", "Remaining sum", "Leaf validation", "Empty tree"], ["trees", "depth-first search"], "function hasPathSum(root, target) {\n  // Write your solution here\n}\n", ["Nodes are integers", "Do not count a partial path as a complete result"], [{"input": "root = [5,4,8,11,null,13,4,7,2,null,null,null,1], target = 22", "output": "true", "explanation": "5 -> 4 -> 11 -> 2 sums to 22."}]),
    GeneratedQuestion("Given a directed graph, find whether it is possible to finish all courses from its prerequisite pairs.", "Algorithms & Data Structures", "Graphs", 4, "technical", ["Graph representation", "Cycle detection", "In-degree processing", "Complexity"], ["graphs", "topological sort"], "function canFinish(numCourses, prerequisites) {\n  // Write your solution here\n}\n", ["0 <= numCourses <= 2000", "No duplicate prerequisite pairs", "A course should not depend on itself"], [{"input": "numCourses = 2, prerequisites = [[1, 0]]", "output": "true", "explanation": "Take course 0, then course 1."}]),
    GeneratedQuestion("Tell me about a difficult production incident you led. How did you align the team and communicate the trade-offs?", "Engineering Leadership", "Incident Leadership", 3, "techno_managerial", ["Decision ownership", "Communication", "Trade-offs", "Learning"], ["incident management", "leadership"]),
]


def resolve_domain(request: QuestionRequest) -> str:
    if request.interview_type.lower() == "coding":
        return "Algorithms & Data Structures"
    if request.domain:
        return request.domain
    text = " ".join(
        [request.focus, *request.profile.primary_topics, *request.profile.tags]
    ).lower()
    scored = sorted(
        ((sum(keyword in text for keyword in keywords), domain)
         for domain, keywords in DOMAINS.items()),
        reverse=True,
    )
    return scored[0][1] if scored and scored[0][0] > 0 else "Backend & APIs"


def plan_stage(question_number: int, planned: int) -> str:
    if question_number <= 1:
        return "icebreaker"
    progress = question_number / max(planned, 1)
    return "techno_managerial" if progress >= 0.8 else "technical"


def target_difficulty(
    profile: Profile,
    stage: str,
    question_number: int = 1,
    planned_question_count: int = 5,
) -> int:
    level = profile.level.lower()
    ranges = {
        "foundational": (1, 2),
        "intermediate": (2, 3),
        "senior": (3, 4),
        "staff": (4, 5),
    }
    low, high = ranges.get(level, (2, 3))
    progress = (question_number - 1) / max(planned_question_count - 1, 1)
    return max(low, min(high, round(low + (high - low) * progress)))


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def hashed_embedding(text: str, dimensions: int = 384) -> list[float]:
    vector = [0.0] * dimensions
    for token in tokenize(text):
        digest = sha1(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign
    norm = sqrt(sum(value * value for value in vector))
    if norm:
        vector = [value / norm for value in vector]
    return vector


def cosine(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


QUESTION_SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string"},
        "topic": {"type": "string"},
        "subtopic": {"type": "string"},
        "difficulty": {"type": "integer", "minimum": 1, "maximum": 5},
        "stage": {"type": "string", "enum": list(STAGES)},
        "expectedPoints": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 8},
        "competencyTags": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 10},
        "codeStarter": {"type": "string"},
        "constraints": {"type": "array", "items": {"type": "string"}},
        "examples": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "input": {"type": "string"},
                    "output": {"type": "string"},
                    "explanation": {"type": "string"},
                },
                "required": ["input", "output"],
            },
        },
    },
    "required": ["text", "topic", "subtopic", "difficulty", "stage", "expectedPoints", "competencyTags"],
}


class QuestionPipeline:
    def __init__(
        self,
        ollama: OllamaClient | None = None,
        gemini: GeminiClient | None = None,
    ) -> None:
        self.ollama = ollama or OllamaClient()
        self.gemini = gemini
        self.provider = "ollama"

    def run(self, request: QuestionRequest) -> dict:
        domain = resolve_domain(request)
        stage = request.stage or plan_stage(
            request.question_number, request.planned_question_count
        )
        difficulty = request.target_difficulty or target_difficulty(
            request.profile,
            stage,
            request.question_number,
            request.planned_question_count,
        )

        if request.mode in ("auto", "generate") and self.ollama.reachable():
            for attempt in range(1, 3):
                try:
                    question = self._generate(
                        request, domain, stage, difficulty, attempt
                    )
                    if self._is_duplicate(question, request.asked_question_texts):
                        continue
                    return self._response(
                        question,
                        "generated",
                        attempt,
                        False,
                        "Generated and accepted by local validation",
                        request,
                    )
                except (OllamaError, GeminiError, ValueError, KeyError) as error:
                    reason = str(error)
            return self._fallback(
                domain, stage, difficulty,
                f"{self.provider} generation failed; served local fallback. Reason: {reason}",
                2,
                request,
            )

        question = self._select(domain, stage, difficulty)
        return self._response(
            question,
            "fallback",
            0,
            True,
            "Ollama is unavailable; selected the best local curated question",
            request,
        )

    def doctor(self) -> dict:
        reachable = self.ollama.reachable()
        models = self.ollama.list_models() if reachable else []
        model = self.ollama.model
        return {
            "provider": self.provider,
            "provider_reachable": reachable,
            "ollama_reachable": reachable,
            "ollama_url": self.ollama.base_url,
            "model": model,
            "model_installed": model in models,
            "models": models,
        }

    def _select(self, domain: str, stage: str, difficulty: int) -> GeneratedQuestion:
        pool = [q for q in CURATED if q.topic == domain]
        if not pool:
            pool = CURATED
        stage_pool = [q for q in pool if q.stage == stage]
        if stage_pool:
            pool = stage_pool
        pool.sort(key=lambda q: abs(q.difficulty - difficulty))
        shortlist = pool[: min(3, len(pool))]
        return random.choice(shortlist)

    def _fallback(
        self,
        domain: str,
        stage: str,
        difficulty: int,
        reason: str,
        attempts: int,
        request: QuestionRequest,
    ) -> dict:
        question = self._select(domain, stage, difficulty)
        return self._response(question, "fallback", attempts, True, reason, request)

    def _generate(
        self,
        request: QuestionRequest,
        domain: str,
        stage: str,
        difficulty: int,
        attempt: int,
    ) -> GeneratedQuestion:
        style = [q.text for q in CURATED if q.topic == domain][:5]
        asked = "\n".join(f"- {text}" for text in request.asked_question_texts[-10:])
        coding = request.interview_type.lower() == "coding"
        system = (
            "You are a senior coding interviewer. Return only a single valid JSON object."
            if coding
            else "You are a senior technical interviewer. Return only a single valid JSON "
                 "object."
        )
        system += (
            " For coding questions, provide a clear DSA problem, starter function code,"
            " constraints, and sample test cases. Do not repeat or paraphrase prior questions."
        )
        coding_contract = (
            '\nReturn exactly this JSON object:\n'
            '{"text":"...","topic":"Algorithms & Data Structures","subtopic":"...","difficulty":'
            f'{difficulty},"stage":"{stage}","expectedPoints":["..."],"competencyTags":["..."],'
            '"codeStarter":"function solution(input) {\\n  // Write your solution here\\n}\\n",'
            '"constraints":["..."],"examples":[{"input":"...","output":"...","explanation":"..."}]}'
            if coding
            else '\nReturn exactly this JSON object:\n'
                 '{"text":"...","topic":"%s","subtopic":"...","difficulty":%d,"stage":"%s",'
                 '"expectedPoints":["..."],"competencyTags":["..."]}' % (domain, difficulty, stage)
        )
        prompt = f"""Create the next interview question.
Session variation seed: {request.generation_seed or "default"}
Use this seed only to vary the scenario, company context, and constraints. Do not mention the seed.
Candidate level: {request.profile.level}
Experience: {request.profile.experience_years} years
Tags: {", ".join(request.profile.tags) or "not provided"}
Primary topics: {", ".join(request.profile.primary_topics) or domain}
Domain: {domain}
Stage: {stage}
Difficulty: {difficulty}/5
Question: {request.question_number} of {request.planned_question_count}
Last question: {request.last_question or "none"}
Last answer: {(request.last_answer or "none")[:1800]}
Last score: {request.last_score if request.last_score is not None else "not scored"}/10

Already asked:
{asked or "- none"}

Local style examples:
{chr(10).join(f"- {text}" for text in style) or "- none"}

{coding_contract}"""
        result = self.ollama.generate_json(
            system=system,
            prompt=prompt,
            schema=QUESTION_SCHEMA,
            temperature=0.75 if attempt == 1 else 0.55,
        )
        data = result.data
        text = str(data["text"]).strip()
        if len(text) < 24:
            raise ValueError("Generated question text is too short")
        subtopic = str(data.get("subtopic") or "General")
        stage_value = str(data["stage"])
        if stage_value not in STAGES:
            raise ValueError("Generated question has an invalid stage")
        return GeneratedQuestion(
            text=text,
            topic=domain,
            subtopic=subtopic,
            difficulty=difficulty,
            stage=stage_value,
            expected_points=[str(x) for x in data["expectedPoints"]],
            competency_tags=[str(x) for x in data["competencyTags"]],
            codeStarter=str(data.get("codeStarter") or "") if coding else None,
            constraints=[str(x) for x in data.get("constraints", [])] if coding else [],
            examples=[
                {
                    "input": str(item.get("input", "")),
                    "output": str(item.get("output", "")),
                    "explanation": str(item.get("explanation", "")),
                }
                for item in data.get("examples", [])
                if isinstance(item, dict)
            ] if coding else [],
        )

    def _is_duplicate(self, question: GeneratedQuestion, asked: Iterable[str]) -> bool:
        threshold = float(os.getenv("DUPLICATE_THRESHOLD", "0.86"))
        vector = hashed_embedding(question.text)
        for text in asked:
            if cosine(vector, hashed_embedding(text)) >= threshold:
                return True
        return False

    def _response(
        self,
        question: GeneratedQuestion,
        source: str,
        attempts: int,
        fallback_used: bool,
        reason: str,
        request: QuestionRequest | None = None,
    ) -> dict:
        if request and request.interview_type.lower() == "coding":
            question.codeStarter = question.codeStarter or (
                "function solution(input) {\n"
                "  // Implement your solution here\n"
                "}\n"
            )
            question.constraints = question.constraints or [
                f"Optimize for the selected {request.profile.level.lower()} difficulty",
                "Handle empty inputs and boundary values",
                "Explain time and space complexity",
            ]
            question.examples = question.examples or [
                {
                    "input": "input = sample input",
                    "output": "expected output",
                    "explanation": "Derive the result using the stated constraints.",
                }
            ]
        return {
            "question": asdict(question)
            | {
                "id": sha1(question.text.encode("utf-8")).hexdigest()[:16],
                "status": "approved" if source in ("curated", "fallback") else "draft",
                "source": source,
            },
            "source": source,
            "accepted": True,
            "reason": reason,
            "attempts": attempts,
            "provider": self.provider if source == "generated" else "local",
            "model": (
                (self.gemini.model if self.provider == "gemini" else self.ollama.model)
                if source == "generated"
                else "curated-bank"
            ),
            "cached": False,
            "fallbackUsed": fallback_used,
        }
