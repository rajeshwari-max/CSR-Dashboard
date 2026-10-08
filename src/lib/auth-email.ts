/**
 * Transactional email for authentication, sent through Resend's HTTPS API.
 * Credentials come only from the environment (RESEND_API_KEY, OTP_FROM_EMAIL).
 * Nothing here logs API keys, passwords or one-time codes.
 */
interface EmailMessage { to: string; subject: string; html: string; text: string; purpose: string }

export class EmailDeliveryError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) { super(message); this.name = "EmailDeliveryError"; this.status = status; }
}

/** Email one-time codes at sign-in are on by default; AUTH_EMAIL_OTP=off lets approved users sign in with email + password only. */
export function emailOtpRequired() { return !["off", "false", "0", "disabled"].includes((process.env.AUTH_EMAIL_OTP ?? "").trim().toLowerCase()); }

export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.OTP_FROM_EMAIL); }

/** Public address of the dashboard for links in emails. Render sets RENDER_EXTERNAL_URL automatically. */
export function dashboardUrl(): string | null {
  const value = (process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || "").trim().replace(/\/$/, "");
  return /^https?:\/\/[^\s"'<>]+$/.test(value) ? value : null;
}

function maskEmail(email: string) { const [local = "", domain = ""] = email.split("@"); return `${local.slice(0, 2)}***@${domain}`; }

export async function sendAuthEmail(message: EmailMessage) {
  const apiKey = process.env.RESEND_API_KEY; const from = process.env.OTP_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("[auth-email] not sent: RESEND_API_KEY and OTP_FROM_EMAIL must both be set", { purpose: message.purpose });
    throw new EmailDeliveryError("Email delivery is not configured. Ask the administrator to configure email delivery.", null);
  }
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("[auth-email] delivery request failed", { purpose: message.purpose, to: maskEmail(message.to), reason: error instanceof Error ? error.message : String(error) });
    throw new EmailDeliveryError("We could not send the email. Please try again or contact the administrator.", null);
  }
  if (!response.ok) {
    // Resend's error body explains the cause (for example an unverified sender domain). It never contains the API key.
    const reason = (await response.text().catch(() => "")).slice(0, 500);
    console.error("[auth-email] delivery rejected by Resend", { purpose: message.purpose, to: maskEmail(message.to), status: response.status, reason });
    throw new EmailDeliveryError("We could not send the email. Please try again or contact the administrator.", response.status);
  }
}

export async function sendOtpEmail(to: string, name: string, code: string) {
  await sendAuthEmail({
    purpose: "sign-in-code", to, subject: "Your CMS CSR sign-in code",
    html: `<p>Hello ${escapeHtml(name)},</p><p>Your CMS CSR Intelligence sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes and can be used once. If you did not request it, ignore this email.</p>`,
    text: `Hello ${name},\n\nYour CMS CSR Intelligence sign-in code is: ${code}\n\nThis code expires in 10 minutes and can be used once. If you did not request it, ignore this email.`,
  });
}

export async function sendApprovalEmail(to: string, name: string, approved: boolean) {
  const url = dashboardUrl(); const signIn = url ? `${url}/login` : null;
  if (approved) {
    await sendAuthEmail({
      purpose: "account-approved", to, subject: "Your CMS CSR Intelligence Dashboard account is approved",
      html: `<p>Hello ${escapeHtml(name)},</p><p>Your CMS CSR Intelligence Dashboard account has been approved. You can now sign in with the email address and password you registered with.</p>${signIn ? `<p><a href="${escapeHtml(signIn)}">Sign in to the dashboard</a></p>` : ""}<p>For security, we never send passwords by email. If you forget yours, use <strong>Forgot password?</strong> on the sign-in page.</p><p>— CMS CSR Intelligence</p>`,
      text: `Hello ${name},\n\nYour CMS CSR Intelligence Dashboard account has been approved. You can now sign in with the email address and password you registered with.${signIn ? `\n\nSign in: ${signIn}` : ""}\n\nFor security, we never send passwords by email. If you forget yours, use "Forgot password?" on the sign-in page.\n\n— CMS CSR Intelligence`,
    });
    return;
  }
  await sendAuthEmail({
    purpose: "account-not-approved", to, subject: "CMS CSR dashboard access request update",
    html: `<p>Hello ${escapeHtml(name)},</p><p>Your CMS CSR Intelligence access request was not approved. Contact the dashboard administrator if you believe this is an error.</p>`,
    text: `Hello ${name},\n\nYour CMS CSR Intelligence access request was not approved. Contact the dashboard administrator if you believe this is an error.`,
  });
}

export async function notifyAdminOfRegistration(name: string, email: string) {
  const admin = process.env.ADMIN_EMAIL; if (!admin || !emailConfigured()) return;
  const url = dashboardUrl();
  await sendAuthEmail({
    purpose: "admin-registration-notice", to: admin, subject: "New CMS CSR dashboard access request",
    html: `<p>${escapeHtml(name)} (${escapeHtml(email)}) requested dashboard access.</p><p>Sign in as administrator and open <strong>Access approvals</strong>${url ? ` (<a href="${escapeHtml(url)}/admin/access">${escapeHtml(url)}/admin/access</a>)` : ""} to approve or reject the request.</p>`,
    text: `${name} (${email}) requested dashboard access.\n\nSign in as administrator and open Access approvals${url ? ` (${url}/admin/access)` : ""} to approve or reject the request.`,
  });
}

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character); }
