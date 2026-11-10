import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { user: null, authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        user,
        authenticated: true,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("[Auth Me Error]:", error);
    return NextResponse.json(
      { user: null, authenticated: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
