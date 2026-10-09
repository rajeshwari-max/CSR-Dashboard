import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, adminSessionToken, timingSafeEqual } from "@/lib/auth-session";
import { REVIEW_DECISIONS, type ReviewDecision, listUsers, reviewUser, storageDiagnostics } from "@/lib/auth-store";

export const dynamic = "force-dynamic";

async function isAdmin(request: Request) {
  const secret = process.env.APP_PASSWORD; if (!secret) return false;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1) ?? "";
  return timingSafeEqual(cookie, await adminSessionToken(secret));
}

export async function GET(request: Request) {
  if (!await isAdmin(request)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  return NextResponse.json({ users: await listUsers(), diagnostics: await storageDiagnostics() });
}

export async function PATCH(request: Request) {
  if (!await isAdmin(request)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  let id = ""; let status: ReviewDecision | null = null;
  try { const body = await request.json() as { id?: unknown; status?: unknown }; id = typeof body.id === "string" ? body.id : ""; status = REVIEW_DECISIONS.includes(body.status as ReviewDecision) ? body.status as ReviewDecision : null; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!id || !status) return NextResponse.json({ error: "Choose a valid account and decision." }, { status: 400 });
  try { const result = await reviewUser(id, status); if (!result) return NextResponse.json({ error: "Account not found." }, { status: 404 }); return NextResponse.json({ ok: true, user: result.user, changed: result.changed }); }
  catch (error) { console.error("[admin/users] could not save account status", { userId: id, status, reason: error instanceof Error ? error.message : String(error) }); return NextResponse.json({ error: "The account status could not be saved." }, { status: 500 }); }
}
