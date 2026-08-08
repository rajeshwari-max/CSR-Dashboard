import { NextResponse, type NextRequest } from "next/server";

/**
 * Single shared-password gate via HTTP Basic auth.
 *
 * Runs at the edge before any page or API route, so nothing — including the
 * upload endpoint and generated reports — is reachable without the password.
 * Set APP_PASSWORD in the host's environment; leaving it unset disables the
 * gate entirely (handy for local development).
 */
export function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      // Accept "anything:password" so the username field can be left blank.
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (timingSafeEqual(supplied, password)) return NextResponse.next();
    } catch {
      /* malformed header falls through to the challenge */
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="CMS CSR Intelligence", charset="UTF-8"',
    },
  });
}

/** Constant-time compare so the password can't be guessed by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // Everything except Next's static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.svg|robots.txt).*)"],
};
