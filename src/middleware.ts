import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "cms_csr_session";

/** Password-backed session gate with a first-party login window. */
export async function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  const publicRoute = pathname === "/login" || pathname === "/api/auth/login";
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

async function sessionToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`cms-csr-session:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|robots.txt).*)"],
};
