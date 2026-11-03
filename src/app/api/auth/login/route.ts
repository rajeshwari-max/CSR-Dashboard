import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth-session";
import { authenticateUser } from "@/lib/auth-store";

export const dynamic = "force-dynamic";

const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 12 };

export async function POST(request: Request) {
  if (process.env.AUTH_ENABLED !== "true") return NextResponse.json({ error: "Authentication is currently disabled." }, { status: 404 });
  const configured = process.env.APP_PASSWORD;
  if (!configured) return NextResponse.json({ ok: true, authenticationDisabled: true });

  let supplied = ""; let email = "";
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    supplied = typeof body.password === "string" ? body.password : "";
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ error: "Enter the dashboard password." }, { status: 400 });
  }

  if (!email) return NextResponse.json({ error: "Enter your registered email address." }, { status: 400 });
  if (!supplied) return NextResponse.json({ error: "Enter your password." }, { status: 400 });

  const user = await authenticateUser(email, supplied);
  // Same message for unknown email and wrong password, so the form cannot be used to discover accounts.
  if (!user) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await sessionToken(configured), cookieOptions);
  return response;
}
