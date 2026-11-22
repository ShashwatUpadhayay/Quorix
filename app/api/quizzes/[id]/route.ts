import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getQuizzesCollection,
  getQuizAttemptsCollection,
} from "@/lib/mongodb";
import { shuffleQuestions } from "@/lib/quizParser";
import { ObjectId } from "mongodb";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
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

    const searchParams = req.nextUrl.searchParams;
    const isTaking = searchParams.get("take") === "true";

    // If candidate is initiating a quiz attempt
    if (isTaking) {
      const attemptsCol = await getQuizAttemptsCollection();
      const candidateId = user._id?.toString() || "";
      const quizIdStr = quiz._id?.toString() || id;

      const previousAttempts = await attemptsCol
        .find({ quizId: quizIdStr, candidateId })
        .toArray();

      const attemptCount = previousAttempts.length;

      // Check attempt constraint
      if (quiz.maxAttempts > 0 && attemptCount >= quiz.maxAttempts) {
        return NextResponse.json(
          {
            error: `Maximum attempts reached (${quiz.maxAttempts}/${quiz.maxAttempts})`,
            attemptCount,
            maxAttempts: quiz.maxAttempts,
          },
          { status: 403 }
        );
      }

      // Jumble / randomize the question order using Fisher-Yates
      const jumbledQuestions = shuffleQuestions(quiz.questions || []).map((q) => {
        // Strip out the correct answer & explanation so candidate cannot inspect client payloads
        return {
          id: q.id,
          question: q.question,
          options: q.options,
        };
      });

      return NextResponse.json(
        {
          quiz: {
            _id: quizIdStr,
            title: quiz.title,
            topic: quiz.topic,
            difficulty: quiz.difficulty,
            description: quiz.description,
            maxAttempts: quiz.maxAttempts,
            attemptNumber: attemptCount + 1,
            totalQuestions: jumbledQuestions.length,
            questions: jumbledQuestions,
          },
        },
        { status: 200 }
      );
    }

    // Default inspection view
    return NextResponse.json({ quiz }, { status: 200 });
  } catch (err: unknown) {
    console.error("[Quiz Detail GET Error]:", err);
    return NextResponse.json(
      { error: "Failed to fetch quiz" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "expert" && user.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only experts can delete quizzes" },
        { status: 403 }
      );
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

    // Ensure the expert owns this quiz, unless they are admin
    if (user.role !== "admin" && quiz.expertId !== user._id?.toString()) {
      return NextResponse.json(
        { error: "Forbidden: You can only delete quizzes you authored" },
        { status: 403 }
      );
    }

    await quizzesCol.deleteOne(query);

    return NextResponse.json(
      { success: true, message: "Quiz deleted successfully" },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[Quiz DELETE Error]:", err);
    return NextResponse.json(
      { error: "Failed to delete quiz" },
      { status: 500 }
    );
  }
}
