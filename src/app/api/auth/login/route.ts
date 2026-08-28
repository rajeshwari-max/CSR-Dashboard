import { NextResponse } from "next/server";

const SESSION_COOKIE = "cms_csr_session";

export async function POST(request: Request) {
  const configured = process.env.APP_PASSWORD;
  if (!configured) return NextResponse.json({ ok: true, authenticationDisabled: true });

  let supplied = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    supplied = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Enter the dashboard password." }, { status: 400 });
  }

  if (!timingSafeEqual(supplied, configured)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
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

async function sessionToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`cms-csr-session:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
