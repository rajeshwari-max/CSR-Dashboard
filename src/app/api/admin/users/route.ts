import { NextResponse } from "next/server";
import { sendApprovalEmail } from "@/lib/auth-email";
import { ADMIN_SESSION_COOKIE, adminSessionToken, timingSafeEqual } from "@/lib/auth-session";
import { listUsers, reviewUser } from "@/lib/auth-store";

async function isAdmin(request: Request) {
  const secret = process.env.APP_PASSWORD; if (!secret) return false;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1) ?? "";
  return timingSafeEqual(cookie, await adminSessionToken(secret));
}
export async function GET(request: Request) {
  if (!await isAdmin(request)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  return NextResponse.json({ users: await listUsers() });
}
export async function PATCH(request: Request) {
  if (!await isAdmin(request)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  let id = ""; let status: "approved" | "rejected" | null = null;
  try { const body = await request.json() as { id?: unknown; status?: unknown }; id = typeof body.id === "string" ? body.id : ""; status = body.status === "approved" || body.status === "rejected" ? body.status : null; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!id || !status) return NextResponse.json({ error: "Choose a valid account and decision." }, { status: 400 });
  const user = await reviewUser(id, status); if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  sendApprovalEmail(user.email, user.name, status === "approved").catch((error) => console.error("Approval email failed", error));
  return NextResponse.json({ ok: true, user });
}
