import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth-session";
import { verifyLoginOtp } from "@/lib/auth-store";

export async function POST(request: Request) {
  const configured = process.env.APP_PASSWORD;
  if (!configured) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  let email = ""; let code = "";
  try { const body = await request.json() as { email?: unknown; code?: unknown }; email = typeof body.email === "string" ? body.email : ""; code = typeof body.code === "string" ? body.code.trim() : ""; }
  catch { return NextResponse.json({ error: "Enter the six-digit code." }, { status: 400 }); }
  if (!/^\d{6}$/.test(code) || !await verifyLoginOtp(email, code, configured)) return NextResponse.json({ error: "The code is incorrect, expired, or has been used." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await sessionToken(configured), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  return response;
}
