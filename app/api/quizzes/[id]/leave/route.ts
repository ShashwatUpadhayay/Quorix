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

    const attemptsCol = await getQuizAttemptsCollection();
    const body = await req.json().catch(() => ({}));
    const {
      attemptId,
      answers = {},
    } = body as {
      attemptId?: string;
      answers?: Record<string, string>;
    };

    if (typeof attemptId !== "string" || !ObjectId.isValid(attemptId)) {
      return NextResponse.json(
        { error: "A valid quiz attempt is required to leave" },
        { status: 400 }
      );
    }

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

    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return NextResponse.json(
        { error: "Answers must be provided as an object" },
        { status: 400 }
      );
    }

    const questionsById = new Map(
      (quiz.questions || []).map((question) => [question.id, question])
    );
    const orderedQuestions = attempt.questionOrder
      .map((questionId) => questionsById.get(questionId))
      .filter((question): question is QuizQuestion => question !== undefined);
    const breakdown = orderedQuestions.map((question) => {
      const selectedAnswer = answers[question.id] || "";
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

    const submittedAt = new Date();
    const timeSpentSeconds = Math.max(
      0,
      Math.floor(
        (submittedAt.getTime() -
          (attempt.startedAt || submittedAt).getTime()) /
          1000
      )
    );
    const updateResult = await attemptsCol.updateOne(attemptQuery, {
      $set: {
        answers,
        breakdown,
        status: "abandoned",
        timeSpentSeconds,
        submittedAt,
      },
    });
    if (updateResult.modifiedCount !== 1) {
      return NextResponse.json(
        { error: "This quiz attempt was already closed" },
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
        action: `Exited Quiz: ${quiz.title}`,
        category: "board",
        detail: `Exited attempt ${attempt.attemptNumber}${quiz.maxAttempts > 0 ? ` of ${quiz.maxAttempts}` : ""} (Attempt consumed)`,
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
        message: "Attempt consumed and recorded as exited.",
        attemptNumber: attempt.attemptNumber,
        maxAttempts: quiz.maxAttempts,
        remainingAttempts,
        canAttempt: quiz.maxAttempts === 0 || attemptCount < quiz.maxAttempts,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[Quiz Leave Error]:", err);
    return NextResponse.json(
      { error: "Failed to record quiz exit" },
      { status: 500 }
    );
  }
}
