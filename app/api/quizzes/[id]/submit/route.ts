import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getQuizzesCollection,
  getQuizAttemptsCollection,
  getDatabase,
  QuizQuestion,
} from "@/lib/mongodb";
import { ObjectId } from "mongodb";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user || user.role !== "candidate" || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quizzesCol = await getQuizzesCollection();
    let query: Record<string, unknown> = { id };
    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) as unknown as string }, { _id: id }] };
    }

    const quiz = await quizzesCol.findOne(query);
    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    const quizIdStr = quiz._id?.toString() || id;
    const candidateId = user._id.toString();

    const body = await req.json();
    const {
      answers = {},
      attemptId,
      status = "completed",
    } = body as {
      answers: Record<string, string>;
      attemptId?: string;
      status?: "completed" | "timed_out";
    };

    if (typeof attemptId !== "string" || !ObjectId.isValid(attemptId)) {
      return NextResponse.json(
        { error: "A valid quiz attempt is required to submit" },
        { status: 400 }
      );
    }

    const attemptsCol = await getQuizAttemptsCollection();
    const attemptQuery = {
      _id: new ObjectId(attemptId) as unknown as string,
      quizId: quizIdStr,
      candidateId,
      status: "in_progress" as const,
    };
    const attempt = await attemptsCol.findOne(attemptQuery);
    if (!attempt) {
      return NextResponse.json(
        { error: "This quiz attempt is no longer active" },
        { status: 409 }
      );
    }

    if (
      !answers ||
      typeof answers !== "object" ||
      Array.isArray(answers)
    ) {
      return NextResponse.json(
        { error: "Answers must be provided as an object" },
        { status: 400 }
      );
    }

    let score = 0;
    const total = quiz.questions?.length || 0;
    const questionsMap = new Map((quiz.questions || []).map((q) => [q.id, q]));

    const orderedQuestions = attempt.questionOrder
      .map((questionId) => questionsMap.get(questionId))
      .filter((question): question is QuizQuestion => question !== undefined);
    const breakdown = orderedQuestions.map((q) => {
      const selected = answers[q.id] || "";
      const correct = q.correctAnswer || "";

      // Matching logic: normalize both strings
      const isMatch =
        selected.trim().toLowerCase() === correct.trim().toLowerCase();

      if (isMatch) {
        score++;
      }

      return {
        questionId: q.id,
        question: q.question,
        options: q.options,
        selectedAnswer: selected,
        correctAnswer: correct,
        isCorrect: isMatch,
        explanation: q.explanation,
      };
    });

    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const submittedAt = new Date();
    const startedAt = attempt.startedAt || submittedAt;
    const timeSpentSeconds = Math.max(
      0,
      Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000)
    );
    const timeLimitMinutes = quiz.timeLimitMinutes || 0;
    const timedOut =
      status === "timed_out" ||
      (timeLimitMinutes > 0 &&
        timeSpentSeconds >= timeLimitMinutes * 60);
    const attemptStatus = timedOut ? "timed_out" : "completed";

    const updateResult = await attemptsCol.updateOne(attemptQuery, {
      $set: {
        answers,
        score,
        total,
        percentage,
        status: attemptStatus,
        timeSpentSeconds,
        breakdown,
        submittedAt,
      },
    });
    if (updateResult.modifiedCount !== 1) {
      return NextResponse.json(
        { error: "This quiz attempt was already submitted" },
        { status: 409 }
      );
    }

    // Record activity log
    try {
      const db = await getDatabase();
      await db.collection("activities").insertOne({
        userId: candidateId,
        userName: user.name,
        userEmail: user.email,
        action: `${attemptStatus === "timed_out" ? "Timed Out" : "Completed"} Quiz: ${quiz.title}`,
        category: "board",
        detail: `Score: ${score}/${total} (${percentage}%) • Attempt ${attempt.attemptNumber}${quiz.maxAttempts > 0 ? ` of ${quiz.maxAttempts}` : ""}`,
        createdAt: new Date(),
      });
    } catch {
      // Non-blocking log
    }

    const attemptCount = await attemptsCol.countDocuments({
      quizId: quizIdStr,
      candidateId,
    });
    const remainingAttempts =
      quiz.maxAttempts > 0 ? Math.max(0, quiz.maxAttempts - attemptCount) : null;

    return NextResponse.json(
      {
        success: true,
        attemptId,
        score,
        total,
        percentage,
        breakdown,
        attemptNumber: attempt.attemptNumber,
        status: attemptStatus,
        timeSpentSeconds,
        maxAttempts: quiz.maxAttempts,
        remainingAttempts,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[Quiz Submit Error]:", err);
    return NextResponse.json(
      { error: "Failed to submit quiz attempt" },
      { status: 500 }
    );
  }
}
