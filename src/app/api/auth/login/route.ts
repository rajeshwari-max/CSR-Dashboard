import { NextResponse } from "next/server";
import { emailConfigured, emailOtpRequired, sendOtpEmail } from "@/lib/auth-email";
import { ADMIN_SESSION_COOKIE, SESSION_COOKIE, adminSessionToken, sessionToken, timingSafeEqual } from "@/lib/auth-session";
import { OtpRateLimitError, authenticateUser, cancelLoginOtp, createLoginOtp } from "@/lib/auth-store";

export const dynamic = "force-dynamic";

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
  if (!supplied) return NextResponse.json({ error: "Enter your password." }, { status: 400 });

  const user = await authenticateUser(email, supplied);
  // Same message for unknown email and wrong password, so the form cannot be used to discover accounts.
  if (!user) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  if (user.status === "pending") return NextResponse.json({ error: "Your registration is waiting for administrator approval.", status: "pending" }, { status: 403 });
  if (user.status === "rejected") return NextResponse.json({ error: "This account has not been approved. Contact the administrator.", status: "rejected" }, { status: 403 });
  if (user.status !== "approved") return NextResponse.json({ error: "This account is inactive. Contact the administrator.", status: user.status }, { status: 403 });

  if (!emailOtpRequired()) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, await sessionToken(configured), cookieOptions);
    return response;
  }

  if (!emailConfigured()) {
    console.error("[auth/login] approved user cannot receive a sign-in code: RESEND_API_KEY / OTP_FROM_EMAIL are not set");
    return NextResponse.json({ error: "Your account is approved, but sign-in codes cannot be emailed because email delivery is not configured. Contact the administrator." }, { status: 503 });
  }
  try {
    const otp = await createLoginOtp(user.email, configured);
    try { await sendOtpEmail(user.email, user.name, otp.code); }
    catch (error) { await cancelLoginOtp(user.email); throw error; }
  } catch (error) {
    if (error instanceof OtpRateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    return NextResponse.json({ error: "Your account is approved, but we could not email your sign-in code. Please try again shortly or contact the administrator." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, requiresOtp: true, email: user.email });
}
