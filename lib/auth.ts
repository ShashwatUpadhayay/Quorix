import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getDatabase, UserDoc } from "./mongodb";
import { ObjectId } from "mongodb";

const JWT_SECRET_STRING =
  process.env.JWT_SECRET ||
  "quorix_super_secret_jwt_key_at_least_32_characters_long_entropy";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

export const AUTH_COOKIE_NAME = "quorix_session";
export const TOKEN_EXPIRY_DAYS = 7;

export interface AuthTokenPayload {
  sub: string; // User ID
  email: string;
  name: string;
  role: "candidate" | "expert" | "admin";
}

/**
 * Hashes a plaintext password using bcrypt with 10 salt rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Verifies a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Signs a JWT token containing user identity and role.
 */
export async function signAuthToken(payload: AuthTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_EXPIRY_DAYS}d`)
    .sign(JWT_SECRET);
}

/**
 * Verifies a JWT token and returns the payload, or null if invalid/expired.
 */
export async function verifyAuthToken(
  token: string
): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as "candidate" | "expert" | "admin",
    };
  } catch {
    return null;
  }
}

/**
 * Retrieves the currently authenticated user from the HTTP-only cookie.
 * Can be called inside server components, route handlers, or server actions.
 */
export async function getCurrentUser(): Promise<Omit<UserDoc, "passwordHash"> | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

    if (!token) {
      return null;
    }

    const payload = await verifyAuthToken(token);
    if (!payload?.sub) {
      return null;
    }

    const db = await getDatabase();
    const user = await db.collection<UserDoc>("users").findOne({
      _id: new ObjectId(payload.sub) as unknown as string,
    });

    if (!user || user.status === "suspended") {
      return null;
    }

    return {
      _id: user._id?.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      profileCompleted: user.profileCompleted,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  } catch (error) {
    console.error("[Quorix Auth] Error retrieving current user:", error);
    return null;
  }
}
