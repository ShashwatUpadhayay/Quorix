import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getQuizzesCollection, getQuizAttemptsCollection } from "@/lib/mongodb";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const quizQuery: Record<string, unknown> = ObjectId.isValid(id)
      ? { _id: new ObjectId(id) as unknown as string }
      : { id };
    const quizzesCol = await getQuizzesCollection();
    const quiz = await quizzesCol.findOne(quizQuery);
    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    const isExpert = user.role === "expert" || user.role === "admin";
    if (isExpert && user.role !== "admin" && quiz.expertId !== user._id.toString()) {
      return NextResponse.json(
        { error: "You can only view results for quizzes you authored" },
        { status: 403 }
      );
    }
    if (!isExpert && user.role !== "candidate") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const quizId = quiz._id?.toString() || id;
    const attemptsCol = await getQuizAttemptsCollection();

    if (isExpert) {
      const attempts = await attemptsCol
        .find({ quizId })
        .sort({ submittedAt: -1, startedAt: -1 })
        .toArray();
      const bestByCandidate = new Map<
        string,
        (typeof attempts)[number]
      >();
      for (const attempt of attempts) {
        if (attempt.status === "in_progress" || attempt.status === "abandoned") {
          continue;
        }
        const previous = bestByCandidate.get(attempt.candidateId);
        if (
          !previous ||
          attempt.percentage > previous.percentage ||
          (attempt.percentage === previous.percentage &&
            (attempt.score > previous.score ||
              (attempt.score === previous.score &&
                (attempt.timeSpentSeconds ?? Number.MAX_SAFE_INTEGER) <
                  (previous.timeSpentSeconds ?? Number.MAX_SAFE_INTEGER))))
        ) {
          bestByCandidate.set(attempt.candidateId, attempt);
        }
      }
      const rankedAttempts = Array.from(bestByCandidate.values()).sort(
        (a, b) =>
          b.percentage - a.percentage ||
          b.score - a.score ||
          (a.timeSpentSeconds ?? Number.MAX_SAFE_INTEGER) -
            (b.timeSpentSeconds ?? Number.MAX_SAFE_INTEGER)
      );
      const leaderboard = rankedAttempts.map((attempt, index) => {
        const previous = rankedAttempts[index - 1];
        return {
          rank:
            previous &&
            previous.percentage === attempt.percentage &&
            previous.score === attempt.score
              ? index
              : index + 1,
          candidateName: attempt.candidateName,
          attemptNumber: attempt.attemptNumber,
          score: attempt.score,
          total: attempt.total,
          percentage: attempt.percentage,
          timeSpentSeconds: attempt.timeSpentSeconds ?? null,
        };
      });
      return NextResponse.json({
        quiz: { _id: quizId, title: quiz.title, maxAttempts: quiz.maxAttempts },
        view: "expert",
        leaderboard,
        attempts: attempts.map((attempt) => ({
          attemptId: attempt._id?.toString(),
          candidateName: attempt.candidateName,
          candidateEmail: attempt.candidateEmail || "",
          attemptNumber: attempt.attemptNumber,
          score: attempt.score,
          total: attempt.total,
          percentage: attempt.percentage,
          status: attempt.status || "completed",
          timeSpentSeconds: attempt.timeSpentSeconds ?? null,
          startedAt: attempt.startedAt || null,
          submittedAt: attempt.submittedAt || null,
          breakdown: attempt.breakdown || [],
          answers: attempt.answers || {},
        })),
      });
    }

    const candidateAttempts = await attemptsCol
      .find({ quizId, candidateId: user._id.toString() })
      .sort({ submittedAt: -1, startedAt: -1 })
      .toArray();
    return NextResponse.json({
      quiz: { _id: quizId, title: quiz.title },
      view: "candidate",
      attempts: candidateAttempts.map((attempt) => {
        const questionsById = new Map(
          (quiz.questions || []).map((question) => [question.id, question])
        );
        const breakdown =
          attempt.breakdown ||
          attempt.questionOrder
            .map((questionId) => questionsById.get(questionId))
            .filter((question) => question !== undefined)
            .map((question) => {
              const selectedAnswer = attempt.answers?.[question.id] || "";
              return {
                questionId: question.id,
                question: question.question,
                options: question.options,
                selectedAnswer,
                correctAnswer: question.correctAnswer,
                isCorrect:
                  selectedAnswer.trim().toLowerCase() ===
                  question.correctAnswer.trim().toLowerCase(),
                explanation: question.explanation,
              };
            });

        return {
          attemptId: attempt._id?.toString(),
          attemptNumber: attempt.attemptNumber,
          score: attempt.score,
          total: attempt.total,
          percentage: attempt.percentage,
          status: attempt.status || "completed",
          timeSpentSeconds: attempt.timeSpentSeconds ?? null,
          submittedAt: attempt.submittedAt || null,
          breakdown,
        };
      }),
    });
  } catch (error: unknown) {
    console.error("[Quiz Results GET Error]:", error);
    return NextResponse.json(
      { error: "Failed to fetch quiz results" },
      { status: 500 }
    );
  }
}
