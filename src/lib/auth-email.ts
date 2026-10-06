interface EmailMessage { to: string; subject: string; html: string }

export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.OTP_FROM_EMAIL); }

export async function sendAuthEmail(message: EmailMessage) {
  const apiKey = process.env.RESEND_API_KEY; const from = process.env.OTP_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Email OTP is not configured. Ask the administrator to configure email delivery.");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html }) });
  if (!response.ok) { console.error("Authentication email delivery failed", response.status, await response.text()); throw new Error("We could not send the email. Please try again or contact the administrator."); }
}

export async function sendOtpEmail(to: string, name: string, code: string) {
  await sendAuthEmail({ to, subject: "Your CMS CSR sign-in code", html: `<p>Hello ${escapeHtml(name)},</p><p>Your CMS CSR Intelligence sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes and can be used once. If you did not request it, ignore this email.</p>` });
}
export async function sendApprovalEmail(to: string, name: string, approved: boolean) {
  await sendAuthEmail({ to, subject: approved ? "CMS CSR dashboard access approved" : "CMS CSR dashboard access request update", html: approved ? `<p>Hello ${escapeHtml(name)},</p><p>Your CMS CSR Intelligence account has been approved. You can now sign in; a one-time code will be sent to this email address.</p>` : `<p>Hello ${escapeHtml(name)},</p><p>Your CMS CSR Intelligence access request was not approved. Contact the dashboard administrator if you believe this is an error.</p>` });
}
export async function notifyAdminOfRegistration(name: string, email: string) {
  const admin = process.env.ADMIN_EMAIL; if (!admin || !emailConfigured()) return;
  await sendAuthEmail({ to: admin, subject: "New CMS CSR dashboard access request", html: `<p>${escapeHtml(name)} (${escapeHtml(email)}) requested dashboard access.</p><p>Sign in as administrator and open <strong>Access approvals</strong> to approve or reject the request.</p>` });
}
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character); }
