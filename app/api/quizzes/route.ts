import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getQuizzesCollection,
  getQuizAttemptsCollection,
  QuizDoc,
  DifficultyTier,
} from "@/lib/mongodb";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quizzesCol = await getQuizzesCollection();
    const attemptsCol = await getQuizAttemptsCollection();

    // Fetch active quizzes sorted by newest
    const quizFilter =
      user.role === "expert" ? { expertId: user._id?.toString() } : {};
    const quizzes = await quizzesCol
      .find(quizFilter)
      .sort({ createdAt: -1 })
      .toArray();

    // If user is candidate, attach user's specific attempt counts and best scores
    if (user.role === "candidate" && user._id) {
      const candidateId = user._id.toString();
      const userAttempts = await attemptsCol
        .find({ candidateId })
        .toArray();

      const enriched = quizzes.map((q) => {
        const quizIdStr = q._id?.toString() || "";
        const myAttempts = userAttempts.filter(
          (att) => att.quizId === quizIdStr
        );
        const scoredAttempts = myAttempts.filter(
          (attempt) => attempt.status === "completed" || attempt.status === "timed_out"
        );
        const bestScore = scoredAttempts.reduce(
          (max, att) => Math.max(max, att.percentage),
          0
        );
        const remainingAttempts =
          q.maxAttempts > 0
            ? Math.max(0, q.maxAttempts - myAttempts.length)
            : null;

        return {
          _id: quizIdStr,
          expertId: q.expertId,
          expertName: q.expertName,
          title: q.title,
          topic: q.topic,
          difficulty: q.difficulty,
          description: q.description,
          maxAttempts: q.maxAttempts,
          timeLimitMinutes: q.timeLimitMinutes || 0,
          totalQuestions: q.totalQuestions || q.questions?.length || 0,
          createdAt: q.createdAt,
          candidateAttemptsCount: myAttempts.length,
          bestScore: scoredAttempts.length > 0 ? bestScore : null,
          remainingAttempts,
          canAttempt: q.maxAttempts === 0 || myAttempts.length < q.maxAttempts,
        };
      });

      return NextResponse.json({ quizzes: enriched }, { status: 200 });
    }

    // If user is expert or admin, attach aggregate stats
    const allAttempts = await attemptsCol.find({}).toArray();

    const expertQuizzes = quizzes.map((q) => {
      const quizIdStr = q._id?.toString() || "";
      const qAttempts = allAttempts.filter((att) => att.quizId === quizIdStr);
      const totalAttempts = qAttempts.length;
      const scoredAttempts = qAttempts.filter(
        (attempt) => attempt.status === "completed" || attempt.status === "timed_out"
      );
      const avgScore =
        scoredAttempts.length > 0
          ? Math.round(
              scoredAttempts.reduce((acc, curr) => acc + curr.percentage, 0) /
                scoredAttempts.length
            )
          : null;

      return {
        _id: quizIdStr,
        expertId: q.expertId,
        expertName: q.expertName,
        expertEmail: q.expertEmail,
        title: q.title,
        topic: q.topic,
        difficulty: q.difficulty,
        description: q.description,
        maxAttempts: q.maxAttempts,
        timeLimitMinutes: q.timeLimitMinutes || 0,
        totalQuestions: q.totalQuestions || q.questions?.length || 0,
        createdAt: q.createdAt,
        totalAttempts,
        averageScore: avgScore,
        questions: q.questions, // Expert can view the full question bank
      };
    });

    return NextResponse.json({ quizzes: expertQuizzes }, { status: 200 });
  } catch (err: unknown) {
    console.error("[Quizzes GET Error]:", err);
    return NextResponse.json(
      { error: "Failed to load quizzes" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "expert" && user.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only experts can author and host quizzes" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      title,
      topic,
      difficulty,
      description,
      maxAttempts,
      timeLimitMinutes,
      questions,
    } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "Quiz title is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        { error: "At least one question is required to create a quiz" },
        { status: 400 }
      );
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question || !q.question.trim()) {
        return NextResponse.json(
          { error: `Question #${i + 1} has empty text` },
          { status: 400 }
        );
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        return NextResponse.json(
          { error: `Question #${i + 1} requires at least 2 options` },
          { status: 400 }
        );
      }
      if (!q.correctAnswer || !q.correctAnswer.trim()) {
        return NextResponse.json(
          { error: `Question #${i + 1} is missing a designated correct answer` },
          { status: 400 }
        );
      }
    }

    const maxAttemptsNum =
      typeof maxAttempts === "number" && maxAttempts >= 0 ? maxAttempts : 1;
    const timeLimitNum =
      typeof timeLimitMinutes === "number" &&
      Number.isInteger(timeLimitMinutes) &&
      timeLimitMinutes >= 0
        ? timeLimitMinutes
        : 0;

    const newQuiz: Omit<QuizDoc, "_id"> = {
      expertId: user._id || "expert_id",
      expertName: user.name || "Expert",
      expertEmail: user.email,
      title: title.trim(),
      topic: topic?.trim() || "General Engineering",
      difficulty: (difficulty as DifficultyTier) || "Intermediate",
      description: description?.trim() || "",
      maxAttempts: maxAttemptsNum,
      timeLimitMinutes: timeLimitNum,
      questions: questions.map((q, idx) => ({
        id: q.id || `q_${Date.now()}_${idx + 1}`,
        question: q.question.trim(),
        options: q.options.map((opt: string) => opt.trim()),
        correctAnswer: q.correctAnswer.trim(),
        explanation: q.explanation ? q.explanation.trim() : undefined,
      })),
      totalQuestions: questions.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const quizzesCol = await getQuizzesCollection();
    const insertResult = await quizzesCol.insertOne(newQuiz as QuizDoc);

    return NextResponse.json(
      {
        success: true,
        quizId: insertResult.insertedId.toString(),
        message: "Quiz created successfully",
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("[Quizzes POST Error]:", err);
    return NextResponse.json(
      { error: "Failed to create quiz" },
      { status: 500 }
    );
  }
}
