import { NextResponse } from "next/server";

import { SESSION_COOKIE, sessionToken } from "@/lib/auth-session";
import { registerUser } from "@/lib/auth-store";

export async function POST(request: Request) {
  const configured = process.env.APP_PASSWORD;
  if (!configured) {
    return NextResponse.json({ error: "Registration is unavailable until APP_PASSWORD is configured." }, { status: 503 });
  }

  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Complete all registration fields." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  try {
    await registerUser({ name, email, password });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed." },
      { status: 400 },
    );
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
