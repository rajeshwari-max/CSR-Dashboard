import { NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/auth-email";
import { ADMIN_SESSION_COOKIE, SESSION_COOKIE, adminSessionToken, sessionToken, timingSafeEqual } from "@/lib/auth-session";
import { authenticateUser, createLoginOtp } from "@/lib/auth-store";

const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 12 };

export async function POST(request: Request) {
  const configured = process.env.APP_PASSWORD;
  if (!configured) return NextResponse.json({ ok: true, authenticationDisabled: true });

  let supplied = ""; let email = ""; let administrator = false;
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown; administrator?: unknown };
    supplied = typeof body.password === "string" ? body.password : "";
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    administrator = body.administrator === true;
  } catch {
    return NextResponse.json({ error: "Enter the dashboard password." }, { status: 400 });
  }

  if (administrator || timingSafeEqual(supplied, configured)) {
    if (!timingSafeEqual(supplied, configured)) return NextResponse.json({ error: "Incorrect administrator password." }, { status: 401 });
    const response = NextResponse.json({ ok: true, administrator: true });
    response.cookies.set(SESSION_COOKIE, await sessionToken(configured), cookieOptions);
    response.cookies.set(ADMIN_SESSION_COOKIE, await adminSessionToken(configured), cookieOptions);
    return response;
  }
  if (!email) return NextResponse.json({ error: "Enter your registered email address." }, { status: 400 });
  const user = await authenticateUser(email, supplied);
  if (!user) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  if (user.status === "pending") return NextResponse.json({ error: "Your registration is waiting for administrator approval." }, { status: 403 });
  if (user.status === "rejected") return NextResponse.json({ error: "This account has not been approved. Contact the administrator." }, { status: 403 });
  try { const otp = await createLoginOtp(email, configured); await sendOtpEmail(user.email, user.name, otp.code); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send a sign-in code." }, { status: 503 }); }
  return NextResponse.json({ ok: true, requiresOtp: true, email: user.email });
}
