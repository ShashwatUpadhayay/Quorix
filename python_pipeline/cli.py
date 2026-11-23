import argparse
import json
import sys
from dataclasses import asdict

from .ollama import load_env
from .pipeline import Profile, QuestionPipeline, QuestionRequest


def build_profile(args: argparse.Namespace) -> Profile:
    return Profile(
        level=args.level,
        experience_years=args.experience,
        tags=[item.strip() for item in args.tags.split(",") if item.strip()],
        primary_topics=[item.strip() for item in args.topics.split(",") if item.strip()],
        focus_areas=[item.strip() for item in args.focus_areas.split(",") if item.strip()],
    )


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser(description="Quorix Python question pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("doctor", help="Check Ollama and the configured model")

    generate = sub.add_parser("generate", help="Generate or select one question")
    generate.add_argument("--session-id", default="local-python")
    generate.add_argument("--question-number", type=int, default=1)
    generate.add_argument("--planned", type=int, default=5)
    generate.add_argument("--interview-type", default="technical")
    generate.add_argument("--focus", default="")
    generate.add_argument("--domain")
    generate.add_argument("--mode", choices=["auto", "select", "generate"], default="auto")
    generate.add_argument("--level", default="Intermediate")
    generate.add_argument("--experience", type=int, default=3)
    generate.add_argument("--tags", default="")
    generate.add_argument("--topics", default="")
    generate.add_argument("--focus-areas", default="")
    generate.add_argument("--last-question")
    generate.add_argument("--last-answer")
    generate.add_argument("--last-score", type=float)
    generate.add_argument("--asked", action="append", default=[])
    generate.add_argument("--generation-seed", default="")
    sub.add_parser("batch", help="Generate a batch of questions from JSON stdin")

    args = parser.parse_args()
    pipeline = QuestionPipeline()

    if args.command == "doctor":
        print(json.dumps(pipeline.doctor(), indent=2))
        result = pipeline.doctor()
        if not result["provider_reachable"]:
            print("Start Ollama and run: ollama pull " + result["model"], file=sys.stderr)
            raise SystemExit(1)
        return

    if args.command == "batch":
        payload = json.loads(sys.stdin.read())
        profile = Profile(
            level=payload.get("level", "Intermediate"),
            experience_years=int(payload.get("experience", 3)),
            tags=payload.get("tags", []),
            primary_topics=payload.get("topics", []),
            focus_areas=payload.get("focusAreas", []),
        )
        count = max(1, min(20, int(payload.get("count", 5))))
        seed = str(payload.get("sessionSeed", ""))
        session_id = str(payload.get("sessionId", "local-python"))
        asked: list[str] = []
        results = []
        for question_number in range(1, count + 1):
            progress = (question_number - 1) / max(count - 1, 1)
            stage = "icebreaker" if question_number == 1 else (
                "techno_managerial" if question_number == count else "technical"
            )
            request = QuestionRequest(
                session_id=session_id,
                question_number=question_number,
                planned_question_count=count,
                interview_type=payload.get("interpriseType", payload.get("interviewType", "technical")),
                focus=payload.get("focus", ""),
                mode="generate",
                profile=profile,
                stage=stage,
                asked_question_texts=asked,
                generation_seed=f"{seed}-q{question_number}",
            )
            generated = pipeline.run(request)
            text = generated["question"]["text"]
            asked.append(text)
            results.append(generated)
        print(json.dumps(results))
        return

    request = QuestionRequest(
        session_id=args.session_id,
        question_number=args.question_number,
        planned_question_count=args.planned,
        interview_type=args.interview_type,
        focus=args.focus,
        domain=args.domain,
        mode=args.mode,
        profile=build_profile(args),
        asked_question_texts=args.asked,
        last_question=args.last_question,
        last_answer=args.last_answer,
        last_score=args.last_score,
        generation_seed=args.generation_seed,
    )
    print(json.dumps(pipeline.run(request), indent=2))


if __name__ == "__main__":
    main()
