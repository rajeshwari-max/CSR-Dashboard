import { NextResponse } from "next/server";
import { emailConfigured, emailOtpRequired, sendApprovalEmail } from "@/lib/auth-email";
import { ADMIN_SESSION_COOKIE, adminSessionToken, timingSafeEqual } from "@/lib/auth-session";
import { REVIEW_DECISIONS, type ReviewDecision, listUsers, markApprovalEmailSent, reviewUser, storageDiagnostics } from "@/lib/auth-store";

export const dynamic = "force-dynamic";

type EmailOutcome = "sent" | "already_sent" | "failed" | "not_configured" | "not_applicable";
/** Guards against two overlapping approve clicks both sending the notice. */
const approvalEmailsInFlight = new Set<string>();

async function isAdmin(request: Request) {
  const secret = process.env.APP_PASSWORD; if (!secret) return false;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1) ?? "";
  return timingSafeEqual(cookie, await adminSessionToken(secret));
}

export async function GET(request: Request) {
  if (!await isAdmin(request)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const storage = await storageDiagnostics();
  return NextResponse.json({
    users: await listUsers(),
    diagnostics: { emailConfigured: emailConfigured(), adminNoticeConfigured: Boolean(process.env.ADMIN_EMAIL), emailOtpRequired: emailOtpRequired(), ...storage },
  });
}

export async function PATCH(request: Request) {
  if (!await isAdmin(request)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  let id = ""; let status: ReviewDecision | null = null;
  try { const body = await request.json() as { id?: unknown; status?: unknown }; id = typeof body.id === "string" ? body.id : ""; status = REVIEW_DECISIONS.includes(body.status as ReviewDecision) ? body.status as ReviewDecision : null; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!id || !status) return NextResponse.json({ error: "Choose a valid account and decision." }, { status: 400 });

  // 1. Persist the decision first. Nothing after this point can undo it.
  let result: Awaited<ReturnType<typeof reviewUser>>;
  try { result = await reviewUser(id, status); }
  catch (error) { console.error("[admin/users] could not save review decision", { userId: id, status, reason: error instanceof Error ? error.message : String(error) }); return NextResponse.json({ error: "The decision could not be saved. Check the server logs and storage disk." }, { status: 500 }); }
  if (!result) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  let user = result.user;

  // 2. Notify the user. Failures are logged and reported to the admin but never roll back the approval.
  let email: EmailOutcome = "not_applicable";
  if (status === "approved") {
    if (user.approvalEmailSentAt || approvalEmailsInFlight.has(user.id)) email = "already_sent";
    else if (!emailConfigured()) { email = "not_configured"; console.warn("[admin/users] user approved; approval email skipped because RESEND_API_KEY / OTP_FROM_EMAIL are not set", { userId: user.id }); }
    else {
      approvalEmailsInFlight.add(user.id);
      try { await sendApprovalEmail(user.email, user.name, true); user = (await markApprovalEmailSent(user.id)) ?? user; email = "sent"; }
      catch (error) { email = "failed"; console.error("[admin/users] user approved and saved, but the approval email failed", { userId: user.id, reason: error instanceof Error ? error.message : String(error) }); }
      finally { approvalEmailsInFlight.delete(user.id); }
    }
  } else if (status === "rejected" && result.changed && emailConfigured()) {
    try { await sendApprovalEmail(user.email, user.name, false); email = "sent"; }
    catch (error) { email = "failed"; console.error("[admin/users] rejection saved, but the notice email failed", { userId: user.id, reason: error instanceof Error ? error.message : String(error) }); }
  }
  return NextResponse.json({ ok: true, user, changed: result.changed, email });
}
