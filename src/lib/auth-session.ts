export const SESSION_COOKIE = "cms_csr_session";

/** The legacy-compatible session token used by the middleware and auth routes. */
export async function sessionToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`cms-csr-session:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}
