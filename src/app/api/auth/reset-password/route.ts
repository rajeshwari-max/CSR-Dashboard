import { NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/auth-email";
import { createLoginOtp, listUsers, resetUserPassword } from "@/lib/auth-store";

export async function POST(request: Request) {
  const secret = process.env.APP_PASSWORD; if (!secret) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  let body: { email?: unknown; code?: unknown; password?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Enter your account details." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!body.code) {
    const user = (await listUsers()).find((candidate) => candidate.email === email && candidate.status === "approved");
    if (!user) return NextResponse.json({ error: "No approved account was found for this email." }, { status: 404 });
    try { const otp = await createLoginOtp(email, secret); await sendOtpEmail(user.email, user.name, otp.code); return NextResponse.json({ ok: true, requiresOtp: true }); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send the reset code." }, { status: 503 }); }
  }
  const code = typeof body.code === "string" ? body.code.trim() : ""; const password = typeof body.password === "string" ? body.password : "";
  try { const user = /^\d{6}$/.test(code) ? await resetUserPassword(email, code, password, secret) : null; if (!user) return NextResponse.json({ error: "The code is incorrect or expired." }, { status: 401 }); return NextResponse.json({ ok: true, passwordReset: true }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Password reset failed." }, { status: 400 }); }
}
