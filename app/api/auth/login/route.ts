import { NextRequest, NextResponse } from "next/server";
import { getDatabase, UserDoc } from "@/lib/mongodb";
import { verifyPassword, signAuthToken, AUTH_COOKIE_NAME, TOKEN_EXPIRY_DAYS } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Query Database
    const db = await getDatabase();
    const usersCollection = db.collection<UserDoc>("users");

    const user = await usersCollection.findOne({ email: normalizedEmail });
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    if (user.status === "suspended") {
      return NextResponse.json(
        { error: "This account has been suspended. Please contact administration." },
        { status: 403 }
      );
    }

    // Verify Password
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const userId = user._id ? user._id.toString() : "";

    // Sign JWT Token
    const token = await signAuthToken({
      sub: userId,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const response = NextResponse.json(
      {
        message: "Login successful.",
        user: {
          id: userId,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          profileCompleted: user.profileCompleted || false,
        },
      },
      { status: 200 }
    );

    // Set secure HTTP-only cookie
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * TOKEN_EXPIRY_DAYS,
    });

    return response;
  } catch (error: unknown) {
    console.error("[Auth Login Error]:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      {
        error: "Failed to process login request.",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}
