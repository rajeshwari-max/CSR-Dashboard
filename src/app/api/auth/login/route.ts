import { NextResponse } from "next/server";

import { SESSION_COOKIE, sessionToken, timingSafeEqual } from "@/lib/auth-session";
import { authenticateUser } from "@/lib/auth-store";

export async function POST(request: Request) {
  const configured = process.env.APP_PASSWORD;
  if (!configured) return NextResponse.json({ ok: true, authenticationDisabled: true });

  let supplied = "";
  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    supplied = typeof body.password === "string" ? body.password : "";
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ error: "Enter the dashboard password." }, { status: 400 });
  }

  if (email) {
    const user = await authenticateUser(email, supplied);
    if (!user) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  } else if (!timingSafeEqual(supplied, configured)) {
    return NextResponse.json({ error: "Incorrect administrator password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await sessionToken(configured), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
