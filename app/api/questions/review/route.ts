import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import {
  getBankStats,
  reviewQuestion,
  seedCuratedBank,
  type QuestionDoc,
} from "@/lib/questionPipeline/bank";
import { ReviewActionSchema } from "@/lib/questionPipeline/schemas";
import {
  DOMAIN_NAMES,
  PIPELINE_STAGES,
} from "@/lib/questionPipeline/taxonomy";

function canReview(role: string | undefined): boolean {
  return role === "admin" || role === "expert";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function publicQuestion(question: QuestionDoc) {
  const { embedding: _embedding, ...rest } = question;
  return {
    ...rest,
    _id: question._id?.toString(),
    id: question._id?.toString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canReview(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "draft";
    const domain = url.searchParams.get("domain") || "";
    const stage = url.searchParams.get("stage") || "";
    const search = (url.searchParams.get("q") || "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number(url.searchParams.get("limit")) || 20)
    );

    const filter: Record<string, unknown> = {};
    if (status !== "all") filter.status = status;
    if (domain && DOMAIN_NAMES.includes(domain)) filter.topic = domain;
    if (stage && (PIPELINE_STAGES as readonly string[]).includes(stage)) {
      filter.stage = stage;
    }
    if (search) {
      filter.$or = [
        { text: { $regex: escapeRegex(search), $options: "i" } },
        { subtopic: { $regex: escapeRegex(search), $options: "i" } },
        { competencyTags: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }

    const db = await getDatabase();
    const collection = db.collection<QuestionDoc>("questions");
    const [questions, total, stats] = await Promise.all([
      collection
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
      getBankStats(),
    ]);

    return NextResponse.json(
      {
        questions: questions.map(publicQuestion),
        pagination: {
          page,
          limit,
          total,
          pages: Math.max(1, Math.ceil(total / limit)),
        },
        stats,
        filters: {
          domains: DOMAIN_NAMES,
          stages: PIPELINE_STAGES,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    console.error("[GET /api/questions/review] error:", error);
    return NextResponse.json(
      { error: "Failed to load review queue." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canReview(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    if (body.action === "bulk-approve" || body.action === "bulk-reject") {
      const filter: Record<string, unknown> = { status: "draft" };
      if (typeof body.domain === "string" && body.domain) {
        if (DOMAIN_NAMES.includes(body.domain)) filter.topic = body.domain;
      }
      if (typeof body.stage === "string" && body.stage) {
        if ((PIPELINE_STAGES as readonly string[]).includes(body.stage)) {
          filter.stage = body.stage;
        }
      }
      if (typeof body.q === "string" && body.q.trim()) {
        const search = escapeRegex(body.q.trim());
        filter.$or = [
          { text: { $regex: search, $options: "i" } },
          { subtopic: { $regex: search, $options: "i" } },
          { competencyTags: { $regex: search, $options: "i" } },
        ];
      }

      const db = await getDatabase();
      const questions = await db
        .collection<QuestionDoc>("questions")
        .find(filter)
        .project({ _id: 1 })
        .toArray();

      const action = body.action === "bulk-approve" ? "approve" : "reject";
      let updated = 0;
      for (const question of questions) {
        if (!question._id) continue;
        const result = await reviewQuestion({
          id: question._id.toString(),
          action,
          reviewer: user.email || user.name || user._id || "reviewer",
        });
        if (result.updated) updated += 1;
      }

      return NextResponse.json({
        success: true,
        updated,
        stats: await getBankStats(),
      });
    }

    const parsed = ReviewActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid review action.",
          details: parsed.error.issues.map((issue) => issue.message),
        },
        { status: 400 }
      );
    }

    const result = await reviewQuestion({
      id: parsed.data.id,
      action: parsed.data.action,
      updates: parsed.data.updates,
      reviewer: user.email || user.name || user._id || "reviewer",
    });

    if (!result.updated || !result.question) {
      return NextResponse.json(
        { error: "Question not found or could not be updated." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      question: publicQuestion(result.question),
      stats: await getBankStats(),
    });
  } catch (error: unknown) {
    console.error("[PATCH /api/questions/review] error:", error);
    return NextResponse.json(
      { error: "Failed to update question." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !canReview(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.action !== "bootstrap-curated") {
      return NextResponse.json(
        { error: "Unsupported action. Use bootstrap-curated." },
        { status: 400 }
      );
    }

    const seeded = await seedCuratedBank({ force: Boolean(body.force) });
    return NextResponse.json({
      success: true,
      ...seeded,
      stats: await getBankStats(),
    });
  } catch (error: unknown) {
    console.error("[POST /api/questions/review] error:", error);
    return NextResponse.json(
      { error: "Failed to bootstrap the curated bank." },
      { status: 500 }
    );
  }
}
