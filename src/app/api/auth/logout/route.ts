import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth-session";

export async function POST() {
  if (process.env.AUTH_ENABLED !== "true") return new NextResponse(null, { status: 303, headers: { location: "/" } });
  // A relative Location header keeps the public hostname supplied by the
  // browser. Render's request URL can otherwise contain its internal
  // localhost:10000 service address.
  const response = new NextResponse(null, { status: 303, headers: { location: "/login" } });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0, sameSite: "lax" });
  return response;
}
