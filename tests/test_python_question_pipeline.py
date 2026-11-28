import unittest
from types import SimpleNamespace

from python_pipeline.ollama import OllamaClient
from python_pipeline.pipeline import (
    Profile,
    QuestionPipeline,
    QuestionRequest,
    hashed_embedding,
    cosine,
    target_difficulty,
    plan_stage,
)


class QuestionPipelineTests(unittest.TestCase):
    def test_system_design_generation_uses_architecture_specific_contract(self) -> None:
        ollama = OllamaClient(base_url="http://127.0.0.1:1")
        ollama.reachable = lambda: True
        captured = {}

        def generate_json(**kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                data={
                    "text": "Design a global event ingestion platform for one million events per second. Explain its APIs, storage, partitioning, backpressure, and regional failure strategy.",
                    "topic": "System Design",
                    "subtopic": "Event Ingestion",
                    "difficulty": 3,
                    "stage": "technical",
                    "expectedPoints": [
                        "Requirements and SLOs",
                        "Components and data flow",
                        "API and data model",
                        "Capacity and scaling",
                        "Reliability and failure modes",
                        "Trade-offs",
                    ],
                    "competencyTags": ["streaming", "scalability"],
                }
            )

        ollama.generate_json = generate_json
        result = QuestionPipeline(ollama).run(
            QuestionRequest(
                session_id="system-design-local",
                interview_type="system_design",
                focus="Event ingestion",
                profile=Profile(level="Senior"),
                mode="generate",
                stage="technical",
            )
        )

        self.assertEqual(result["source"], "generated")
        self.assertEqual(result["question"]["topic"], "System Design")
        self.assertIn("capacity and scaling", captured["prompt"].lower())
        self.assertIn("data flow", captured["system"].lower())
        self.assertIsNone(result["question"]["codeStarter"])

    def test_system_design_fallback_is_specific_and_has_architecture_rubric(self) -> None:
        pipeline = QuestionPipeline(OllamaClient(base_url="http://127.0.0.1:1"))
        result = pipeline.run(
            QuestionRequest(
                session_id="system-design-fallback",
                interview_type="system_design",
                focus="URL shortening",
                profile=Profile(level="Intermediate"),
                mode="select",
                stage="icebreaker",
            )
        )

        question = result["question"]
        self.assertEqual(question["topic"], "System Design")
        self.assertTrue(question["text"].startswith("Design "))
        self.assertGreaterEqual(len(question["expected_points"]), 4)

    def test_duplicate_generation_fallback_has_no_unbound_reason(self) -> None:
        ollama = OllamaClient(base_url="http://127.0.0.1:1")
        ollama.reachable = lambda: True
        pipeline = QuestionPipeline(ollama)
        request = QuestionRequest(
            session_id="test-duplicates",
            interview_type="technical",
            focus="Backend & APIs",
            profile=Profile(level="Intermediate"),
            mode="generate",
            asked_question_texts=["What is the retry policy?"],
        )
        pipeline._generate = lambda *_args, **_kwargs: pipeline._select(
            "Backend & APIs", "technical", 2
        )
        pipeline._is_duplicate = lambda *_args, **_kwargs: True

        result = pipeline.run(request)
        self.assertEqual(result["source"], "fallback")
        self.assertIn("duplicated", result["reason"])
    def test_coding_requests_include_dsa_editor_metadata_in_fallback(self) -> None:
        pipeline = QuestionPipeline(OllamaClient(base_url="http://127.0.0.1:1"))
        result = pipeline.run(
            QuestionRequest(
                session_id="test-coding",
                interview_type="coding",
                focus="Arrays",
                profile=Profile(level="Intermediate", primary_topics=["Arrays"]),
                mode="select",
                stage="icebreaker",
            )
        )

        question = result["question"]
        self.assertIn("codeStarter", question)
        self.assertIn("constraints", question)
        self.assertIn("examples", question)

    def test_difficulty_tracks_level_and_progress(self) -> None:
        foundational = Profile(level="Foundational")
        self.assertEqual(target_difficulty(foundational, "technical", 1, 5), 1)
        self.assertEqual(target_difficulty(foundational, "technical", 5, 5), 2)
        staff = Profile(level="Staff")
        self.assertEqual(target_difficulty(staff, "technical", 1, 5), 4)
        self.assertEqual(target_difficulty(staff, "technical", 5, 5), 5)

    def test_stage_progression_is_calibrated(self) -> None:
        self.assertEqual(plan_stage(1, 5), "icebreaker")
        self.assertEqual(plan_stage(3, 5), "technical")
        self.assertEqual(plan_stage(5, 5), "techno_managerial")
    def test_domain_resolution_uses_profile_focus(self) -> None:
        pipeline = QuestionPipeline(OllamaClient(base_url="http://127.0.0.1:1"))
        request = QuestionRequest(
            session_id="test",
            focus="PostgreSQL",
            profile=Profile(tags=["PostgreSQL", "Indexing"]),
        )
        result = pipeline.run(request)
        self.assertIn(result["question"]["topic"], ("Databases & Storage", "Backend & APIs"))

    def test_select_mode_never_requires_ollama(self) -> None:
        pipeline = QuestionPipeline(OllamaClient(base_url="http://127.0.0.1:1"))
        result = pipeline.run(
            QuestionRequest(
                session_id="test",
                mode="select",
                stage="icebreaker",
                domain="Backend & APIs",
            )
        )
        self.assertEqual(result["source"], "fallback")
        self.assertTrue(result["accepted"])

    def test_hashed_embedding_is_normalized_and_similar_text_scores_higher(self) -> None:
        first = hashed_embedding("PostgreSQL query optimization and indexing")
        same = hashed_embedding("PostgreSQL query optimization indexes")
        other = hashed_embedding("React component rendering accessibility")
        self.assertGreater(cosine(first, same), cosine(first, other))


if __name__ == "__main__":
    unittest.main()
