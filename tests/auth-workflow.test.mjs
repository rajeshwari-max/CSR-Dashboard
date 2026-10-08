// End-to-end tests for registration → approval → login → notification email.
// Run with: npm run test:auth
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";

const dataDir = await mkdtemp(path.join(tmpdir(), "cms-auth-test-"));
process.env.AUTH_DATA_DIR = dataDir;
process.env.APP_PASSWORD = "admin-secret-for-tests";
process.env.RESEND_API_KEY = "re_test_key";
process.env.OTP_FROM_EMAIL = "CMS CSR <access@example.test>";
process.env.APP_BASE_URL = "https://cms-csr.example.test";
delete process.env.AUTH_EMAIL_OTP;

// Capture outgoing Resend calls instead of sending real email.
const sent = []; let failEmail = false;
globalThis.fetch = async (url, init) => {
  assert.equal(url, "https://api.resend.com/emails");
  const body = JSON.parse(init.body);
  if (failEmail) return new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 });
  sent.push(body); return new Response(JSON.stringify({ id: "test" }), { status: 200 });
};
const errors = []; const originalError = console.error; const originalWarn = console.warn;

const register = (await import("@/app/api/auth/register/route")).POST;
const login = (await import("@/app/api/auth/login/route")).POST;
const verifyOtp = (await import("@/app/api/auth/verify-otp/route")).POST;
const admin = await import("@/app/api/admin/users/route");
const { adminSessionToken, ADMIN_SESSION_COOKIE, SESSION_COOKIE } = await import("@/lib/auth-session");

const json = (url, body, headers = {}) => new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const adminCookie = async () => `${ADMIN_SESSION_COOKIE}=${await adminSessionToken(process.env.APP_PASSWORD)}`;
async function adminList() { const r = await admin.GET(new Request("http://localhost/api/admin/users", { headers: { cookie: await adminCookie() } })); assert.equal(r.status, 200); return r.json(); }
async function decide(id, status) { const r = await admin.PATCH(new Request("http://localhost/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json", cookie: await adminCookie() }, body: JSON.stringify({ id, status }) })); return { status: r.status, body: await r.json() }; }
async function storedUser(email) { return JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8")).find((u) => u.email === email.toLowerCase()); }
async function signUp(name, email, password) { const r = await register(json("/api/auth/register", { name, email, password })); assert.equal(r.status, 200, await r.clone().text()); return (await adminList()).users.find((u) => u.email === email.toLowerCase()); }
const codeFrom = (message) => message.text.match(/\b(\d{6})\b/)[1];

before(() => { console.error = (...args) => errors.push(args.map(String).join(" ")); console.warn = () => {}; });
beforeEach(() => { sent.length = 0; failEmail = false; errors.length = 0; });
after(async () => { console.error = originalError; console.warn = originalWarn; await rm(dataDir, { recursive: true, force: true }); });

describe("registration, approval and login", () => {
  const email = "Asha.Rao@Example.org"; const password = "correct horse battery";
  let id;

  test("1. a new registration is stored as pending", async () => {
    id = (await signUp("Asha Rao", email, password)).id;
    assert.equal((await storedUser("asha.rao@example.org")).status, "pending");
  });

  test("2. a pending user cannot log in", async () => {
    const r = await login(json("/api/auth/login", { email, password }));
    assert.equal(r.status, 403); assert.match((await r.json()).error, /waiting for administrator approval/);
  });

  test("3+5. approval persists to disk and emails the user once, without the password", async () => {
    const { status, body } = await decide(id, "approved");
    assert.equal(status, 200); assert.equal(body.email, "sent"); assert.equal(body.user.status, "approved");
    const stored = await storedUser("asha.rao@example.org");
    assert.equal(stored.status, "approved"); assert.ok(stored.approvalEmailSentAt);
    assert.equal(sent.length, 1); assert.deepEqual(sent[0].to, ["asha.rao@example.org"]);
    assert.match(sent[0].subject, /approved/i); assert.match(sent[0].text, /CMS CSR Intelligence Dashboard account has been approved/);
    assert.match(sent[0].html, /https:\/\/cms-csr\.example\.test\/login/);
    assert.ok(!sent[0].html.includes(password) && !sent[0].text.includes(password));
  });

  test("approving an already-approved user again sends no duplicate email", async () => {
    const { body } = await decide(id, "approved");
    assert.equal(body.email, "already_sent"); assert.equal(body.changed, false); assert.equal(sent.length, 0);
  });

  test("4. the approved user signs in with email + password, then the emailed code", async () => {
    const r = await login(json("/api/auth/login", { email, password }));
    assert.equal(r.status, 200); assert.equal((await r.json()).requiresOtp, true);
    assert.equal(sent.length, 1);
    const v = await verifyOtp(json("/api/auth/verify-otp", { email, code: codeFrom(sent[0]) }));
    assert.equal(v.status, 200); assert.match(v.headers.get("set-cookie") ?? "", new RegExp(`${SESSION_COOKIE}=[0-9a-f]{64}`));
  });

  test("4b. with AUTH_EMAIL_OTP=off the approved user is signed in by email + password alone", async () => {
    process.env.AUTH_EMAIL_OTP = "off";
    try {
      const r = await login(json("/api/auth/login", { email, password }));
      assert.equal(r.status, 200); assert.match(r.headers.get("set-cookie") ?? "", new RegExp(`${SESSION_COOKIE}=`)); assert.equal(sent.length, 0);
    } finally { delete process.env.AUTH_EMAIL_OTP; }
  });

  test("6. an incorrect password is refused", async () => {
    const r = await login(json("/api/auth/login", { email, password: "wrong password!!" }));
    assert.equal(r.status, 401); assert.equal((await r.json()).error, "Incorrect email or password.");
  });

  test("9. after a restart (fresh module, same disk) the approved user can still sign in", async () => {
    const fresh = await import(`../src/lib/auth-store.ts?restart=${Date.now()}`);
    const user = await fresh.authenticateUser(email, password);
    assert.equal(user?.status, "approved");
  });
});

describe("rejected, inactive and email failures", () => {
  test("7. a rejected user cannot log in", async () => {
    const user = await signUp("Ravi K", "ravi@example.org", "another password 1");
    assert.equal((await decide(user.id, "rejected")).status, 200);
    const r = await login(json("/api/auth/login", { email: "ravi@example.org", password: "another password 1" }));
    assert.equal(r.status, 403); assert.match((await r.json()).error, /not been approved/);
  });

  test("an inactive (deactivated) user cannot log in", async () => {
    const user = await signUp("Meera S", "meera@example.org", "meera password 1");
    await decide(user.id, "approved"); await decide(user.id, "inactive");
    const r = await login(json("/api/auth/login", { email: "meera@example.org", password: "meera password 1" }));
    assert.equal(r.status, 403); assert.match((await r.json()).error, /inactive/);
  });

  test("8. when the approval email fails, the approval stays saved and the failure is logged", async () => {
    const user = await signUp("Kiran P", "kiran@example.org", "kiran password 1");
    failEmail = true;
    const { status, body } = await decide(user.id, "approved");
    assert.equal(status, 200); assert.equal(body.email, "failed");
    const stored = await storedUser("kiran@example.org");
    assert.equal(stored.status, "approved"); assert.equal(stored.approvalEmailSentAt, undefined);
    assert.ok(errors.some((line) => line.includes("approval email failed")));
    assert.ok(errors.every((line) => !line.includes("re_test_key") && !line.includes("kiran password 1")), "logs must not contain secrets");
    // Retrying ("Resend email") delivers it once email works again.
    failEmail = false;
    assert.equal((await decide(user.id, "approved")).body.email, "sent"); assert.equal(sent.length, 1);
  });

  test("a failed sign-in code email returns a clear error and does not lock the user out for a minute", async () => {
    failEmail = true;
    const first = await login(json("/api/auth/login", { email: "kiran@example.org", password: "kiran password 1" }));
    assert.equal(first.status, 503); assert.match((await first.json()).error, /approved, but we could not email/);
    failEmail = false;
    const retry = await login(json("/api/auth/login", { email: "kiran@example.org", password: "kiran password 1" }));
    assert.equal(retry.status, 200);
  });

  test("concurrent registrations and approvals do not lose updates", async () => {
    const pending = await signUp("Neha D", "neha@example.org", "neha password 12");
    await Promise.all([
      decide(pending.id, "approved"),
      ...Array.from({ length: 5 }, (_, i) => register(json("/api/auth/register", { name: `Bulk ${i}`, email: `bulk${i}@example.org`, password: "bulk password 1" }))),
    ]);
    assert.equal((await storedUser("neha@example.org")).status, "approved");
    for (let i = 0; i < 5; i += 1) assert.equal((await storedUser(`bulk${i}@example.org`)).status, "pending");
  });

  test("non-administrators cannot approve accounts", async () => {
    const r = await admin.PATCH(new Request("http://localhost/api/admin/users", { method: "PATCH", body: JSON.stringify({ id: "x", status: "approved" }) }));
    assert.equal(r.status, 403);
  });
});
