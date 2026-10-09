import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, SESSION_COOKIE, adminSessionToken, sessionToken, timingSafeEqual } from "@/lib/auth-session";
import { authenticateUser } from "@/lib/auth-store";

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
  if (user.status === "rejected") return NextResponse.json({ error: "This account has not been approved. Contact the administrator.", status: "rejected" }, { status: 403 });
  if (user.status === "inactive") return NextResponse.json({ error: "This account is inactive. Contact the administrator.", status: user.status }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await sessionToken(configured), cookieOptions);
  return response;
}
