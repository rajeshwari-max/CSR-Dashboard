import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, sessionToken, timingSafeEqual } from "@/lib/auth-session";

/** Password-backed session gate with a first-party login window. */
export async function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  const publicRoute =
    pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/register";
  const expected = await sessionToken(password);
  const supplied = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const authenticated = timingSafeEqual(supplied, expected);

  if (publicRoute) {
    if (pathname === "/login" && authenticated) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }
  if (authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|robots.txt).*)"],
};
