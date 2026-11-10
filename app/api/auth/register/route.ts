import { NextRequest, NextResponse } from "next/server";
import { getDatabase, UserDoc } from "@/lib/mongodb";
import { hashPassword, signAuthToken, AUTH_COOKIE_NAME, TOKEN_EXPIRY_DAYS } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, role = "candidate" } = body;

    // Validate input fields
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name must be at least 2 characters long." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== "string" || !emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const validRoles = ["candidate", "expert", "admin"];
    const assignedRole = validRoles.includes(role) ? role : "candidate";

    const normalizedEmail = email.trim().toLowerCase();

    // Query Database
    const db = await getDatabase();
    const usersCollection = db.collection<UserDoc>("users");

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: normalizedEmail });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email address already exists." },
        { status: 409 }
      );
    }

    // Hash password & store user
    const passwordHash = await hashPassword(password);
    const now = new Date();

    const newUserDoc: UserDoc = {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: assignedRole as "candidate" | "expert" | "admin",
      status: "active",
      profileCompleted: false,
      createdAt: now,
      updatedAt: now,
    };

    const insertResult = await usersCollection.insertOne(newUserDoc);
    const userId = insertResult.insertedId.toString();

    // Sign JWT Token
    const token = await signAuthToken({
      sub: userId,
      email: normalizedEmail,
      name: newUserDoc.name,
      role: newUserDoc.role,
    });

    const response = NextResponse.json(
      {
        message: "Registration successful.",
        user: {
          id: userId,
          name: newUserDoc.name,
          email: newUserDoc.email,
          role: newUserDoc.role,
          status: newUserDoc.status,
        },
      },
      { status: 201 }
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
    console.error("[Auth Register Error]:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      {
        error: "Failed to complete registration.",
        details: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}
