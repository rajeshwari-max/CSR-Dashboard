// End-to-end tests for direct email/password registration and login.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { after, describe, test } from "node:test";

const dataDir = await mkdtemp(path.join(process.cwd(), ".cms-auth-test-"));
process.env.AUTH_DATA_DIR = dataDir;
process.env.APP_PASSWORD = "admin-secret-for-tests";

const register = (await import("@/app/api/auth/register/route")).POST;
const login = (await import("@/app/api/auth/login/route")).POST;
const admin = await import("@/app/api/admin/users/route");
const { adminSessionToken, ADMIN_SESSION_COOKIE, SESSION_COOKIE } = await import("@/lib/auth-session");

const json = (url, body, headers = {}) => new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const adminCookie = async () => `${ADMIN_SESSION_COOKIE}=${await adminSessionToken(process.env.APP_PASSWORD)}`;
async function adminList() { const response = await admin.GET(new Request("http://localhost/api/admin/users", { headers: { cookie: await adminCookie() } })); assert.equal(response.status, 200); return response.json(); }
async function decide(id, status) { const response = await admin.PATCH(new Request("http://localhost/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json", cookie: await adminCookie() }, body: JSON.stringify({ id, status }) })); return { status: response.status, body: await response.json() }; }
async function storedUser(email) { return JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8")).find((user) => user.email === email.toLowerCase()); }
async function signUp(name, email, password) { const response = await register(json("/api/auth/register", { name, email, password })); assert.equal(response.status, 200, await response.clone().text()); return (await adminList()).users.find((user) => user.email === email.toLowerCase()); }

after(async () => { await rm(dataDir, { recursive: true, force: true }); });

describe("email and password authentication", () => {
  const email = "Asha.Rao@Example.org"; const password = "correct horse battery";
  let id;

  test("a new registration is active immediately", async () => {
    id = (await signUp("Asha Rao", email, password)).id;
    assert.equal((await storedUser("asha.rao@example.org")).status, "approved");
  });

  test("the registered user signs in directly with email and password", async () => {
    const response = await login(json("/api/auth/login", { email, password }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie") ?? "", new RegExp(`${SESSION_COOKIE}=[0-9a-f]{64}`));
    assert.deepEqual(await response.json(), { ok: true });
  });

  test("an incorrect password is refused", async () => {
    const response = await login(json("/api/auth/login", { email, password: "wrong password!!" }));
    assert.equal(response.status, 401); assert.equal((await response.json()).error, "Incorrect email or password.");
  });

  test("a deactivated account cannot sign in and can be restored", async () => {
    assert.equal((await decide(id, "inactive")).status, 200);
    const blocked = await login(json("/api/auth/login", { email, password })); assert.equal(blocked.status, 403); assert.match((await blocked.json()).error, /inactive/);
    assert.equal((await decide(id, "approved")).status, 200);
    assert.equal((await login(json("/api/auth/login", { email, password }))).status, 200);
  });

  test("accounts survive a module restart when storage is persistent", async () => {
    const fresh = await import(`../src/lib/auth-store.ts?restart=${Date.now()}`);
    assert.equal((await fresh.authenticateUser(email, password))?.status, "approved");
  });

  test("concurrent registrations do not lose accounts", async () => {
    await Promise.all(Array.from({ length: 5 }, (_, index) => register(json("/api/auth/register", { name: `Bulk ${index}`, email: `bulk${index}@example.org`, password: "bulk password 1" }))));
    for (let index = 0; index < 5; index += 1) assert.equal((await storedUser(`bulk${index}@example.org`)).status, "approved");
  });

  test("non-administrators cannot change account status", async () => {
    const response = await admin.PATCH(new Request("http://localhost/api/admin/users", { method: "PATCH", body: JSON.stringify({ id: "x", status: "approved" }) }));
    assert.equal(response.status, 403);
  });
});
