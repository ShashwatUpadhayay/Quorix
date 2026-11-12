import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordUserActivity } from "@/lib/activity";
import { ActivityLogDoc } from "@/lib/mongodb";

const VALID_CATEGORIES: ActivityLogDoc["category"][] = [
  "interview",
  "board",
  "profile",
  "auth",
];

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const detail = typeof body.detail === "string" ? body.detail.trim() : "";
    const category = VALID_CATEGORIES.includes(body.category)
      ? body.category
      : "interview";

    if (!action) {
      return NextResponse.json(
        { error: "Activity action label is required." },
        { status: 400 }
      );
    }

    await recordUserActivity({
      userId: user._id.toString(),
      action,
      category,
      detail: detail || action,
    });

    return NextResponse.json({ message: "Activity recorded." }, { status: 201 });
  } catch (error: unknown) {
    console.error("[Activity POST Error]:", error);
    return NextResponse.json(
      { error: "Failed to record activity." },
      { status: 500 }
    );
  }
}
