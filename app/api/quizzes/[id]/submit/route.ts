import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getQuizzesCollection,
  getQuizAttemptsCollection,
  getDatabase,
  QuizAttemptDoc,
} from "@/lib/mongodb";
import { ObjectId } from "mongodb";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
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
    const candidateId = user._id?.toString() || "";

    const attemptsCol = await getQuizAttemptsCollection();
    const previousAttempts = await attemptsCol
      .find({ quizId: quizIdStr, candidateId })
      .toArray();

    const previousCount = previousAttempts.length;

    // Check maximum attempts limit
    if (quiz.maxAttempts > 0 && previousCount >= quiz.maxAttempts) {
      return NextResponse.json(
        {
          error: `Maximum attempts limit (${quiz.maxAttempts}) reached for this quiz.`,
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { answers = {}, questionOrder = [] } = body as {
      answers: Record<string, string>;
      questionOrder: string[];
    };

    const questionsMap = new Map(
      (quiz.questions || []).map((q) => [q.id, q])
    );

    let score = 0;
    const total = quiz.questions?.length || 0;

    const breakdown = (questionOrder.length > 0
      ? questionOrder.map((qid) => questionsMap.get(qid)).filter(Boolean)
      : quiz.questions
    ).map((q) => {
      if (!q) return null;
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
    }).filter(Boolean);

    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const currentAttemptNumber = previousCount + 1;

    const newAttempt: Omit<QuizAttemptDoc, "_id"> = {
      quizId: quizIdStr,
      candidateId,
      candidateName: user.name || "Candidate",
      candidateEmail: user.email,
      attemptNumber: currentAttemptNumber,
      questionOrder: questionOrder.length > 0 ? questionOrder : (quiz.questions || []).map((q) => q.id),
      answers,
      score,
      total,
      percentage,
      submittedAt: new Date(),
    };

    const insertResult = await attemptsCol.insertOne(
      newAttempt as QuizAttemptDoc
    );

    // Record activity log
    try {
      const db = await getDatabase();
      await db.collection("activities").insertOne({
        userId: candidateId,
        userName: user.name,
        userEmail: user.email,
        action: `Completed Quiz: ${quiz.title}`,
        category: "board",
        detail: `Score: ${score}/${total} (${percentage}%) • Attempt ${currentAttemptNumber}${quiz.maxAttempts > 0 ? ` of ${quiz.maxAttempts}` : ""}`,
        createdAt: new Date(),
      });
    } catch {
      // Non-blocking log
    }

    const remainingAttempts =
      quiz.maxAttempts > 0
        ? Math.max(0, quiz.maxAttempts - currentAttemptNumber)
        : null;

    return NextResponse.json(
      {
        success: true,
        attemptId: insertResult.insertedId.toString(),
        score,
        total,
        percentage,
        breakdown,
        attemptNumber: currentAttemptNumber,
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
