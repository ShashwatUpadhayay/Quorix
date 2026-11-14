import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase, MockSessionDoc, MockSessionResponse } from "@/lib/mongodb";
import { recordUserActivity } from "@/lib/activity";
import {
  evaluateMockResponse,
  generateSessionSummary,
} from "@/lib/mockInterviewEngine";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/mock/session/[id]/answer
 * Submits candidate response to the active question, runs tri-factor evaluation,
 * appends to session transcript, and advances to next question.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
    }

    const userId = user._id.toString();
    const body = await req.json();

    const userAnswer = typeof body.answer === "string" ? body.answer.trim() : "";
    const codeSubmitted =
      typeof body.code === "string" ? body.code.trim() : undefined;
    const language = typeof body.language === "string" ? body.language : undefined;

    if (!userAnswer && !codeSubmitted) {
      return NextResponse.json(
        { error: "Please provide an answer or code solution." },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const session = await db.collection<MockSessionDoc>("mock_sessions").findOne({
      _id: new ObjectId(id) as unknown as string,
      userId,
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status === "completed") {
      return NextResponse.json(
        { error: "This interview session has already been completed." },
        { status: 400 }
      );
    }

    const currentIndex = session.currentQuestionIndex || 0;
    const currentQuestion = session.questions[currentIndex];

    if (!currentQuestion) {
      return NextResponse.json(
        { error: "No active question found for this index." },
        { status: 400 }
      );
    }

    // Evaluate answer in real-time
    const evaluation = evaluateMockResponse({
      question: currentQuestion,
      userAnswer,
      codeSubmitted,
      interviewType: session.interviewType,
      level: session.level,
      focus: session.focus,
    });

    const newResponse: MockSessionResponse = {
      questionId: currentQuestion.id,
      questionPrompt: currentQuestion.prompt,
      stage: currentQuestion.stage,
      userAnswer,
      codeSubmitted,
      language,
      scores: evaluation.scores,
      feedback: evaluation.feedback,
      submittedAt: new Date(),
    };

    const nextIndex = currentIndex + 1;
    const updatedResponses = [...(session.responses || []), newResponse];
    const isCompleted = nextIndex >= session.questions.length;

    let overallScore = session.overallScore;
    let categoryScores = session.categoryScores;
    let summaryFeedback = session.summaryFeedback;

    if (isCompleted) {
      const summary = generateSessionSummary(
        updatedResponses,
        session.interviewType,
        session.focus,
        session.level
      );
      overallScore = summary.overallScore;
      categoryScores = summary.categoryScores;
      summaryFeedback = summary.summaryFeedback;

      await recordUserActivity({
        userId,
        action: "Completed Mock Interview Session",
        category: "interview",
        detail: `${session.title} — Overall Score: ${overallScore}/10`,
      });
    }

    await db.collection<MockSessionDoc>("mock_sessions").updateOne(
      { _id: new ObjectId(id) as unknown as string },
      {
        $set: {
          responses: updatedResponses,
          currentQuestionIndex: nextIndex,
          status: isCompleted ? "completed" : "in_progress",
          overallScore,
          categoryScores,
          summaryFeedback,
          completedAt: isCompleted ? new Date() : undefined,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      evaluation,
      response: newResponse,
      isCompleted,
      nextQuestionIndex: nextIndex,
      totalQuestions: session.questions.length,
      overallScore,
    });
  } catch (error: unknown) {
    console.error("[POST /api/mock/session/[id]/answer] error:", error);
    return NextResponse.json(
      { error: "Failed to submit answer" },
      { status: 500 }
    );
  }
}
