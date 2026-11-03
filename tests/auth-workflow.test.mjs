// End-to-end tests for direct email/password registration and login.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, describe, test } from "node:test";

const dataDir = await mkdtemp(path.join(process.cwd(), ".cms-auth-test-"));
process.env.AUTH_DATA_DIR = dataDir;
process.env.AUTH_ENABLED = "true";
process.env.APP_PASSWORD = "admin-secret-for-tests";

const register = (await import("@/app/api/auth/register/route")).POST;
const login = (await import("@/app/api/auth/login/route")).POST;
const { SESSION_COOKIE } = await import("@/lib/auth-session");

const json = (url, body) => new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
async function storedUser(email) { return JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8")).find((user) => user.email === email.toLowerCase()); }
async function signUp(name, email, password) { const response = await register(json("/api/auth/register", { name, email, password })); assert.equal(response.status, 200, await response.clone().text()); return storedUser(email); }

after(async () => { await rm(dataDir, { recursive: true, force: true }); });

describe("email and password authentication", () => {
  const email = "Asha.Rao@Example.org"; const password = "correct horse battery";
  test("a new registration is saved without an approval state", async () => {
    await signUp("Asha Rao", email, password);
    assert.equal((await storedUser("asha.rao@example.org")).status, undefined);
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

  test("legacy inactive status no longer blocks the correct password", async () => {
    const file = path.join(dataDir, "users.json");
    const users = JSON.parse(await readFile(file, "utf8")); users[0].status = "inactive"; await writeFile(file, JSON.stringify(users));
    assert.equal((await login(json("/api/auth/login", { email, password }))).status, 200);
  });

  test("the former administrator password is not a login shortcut", async () => {
    const response = await login(json("/api/auth/login", { email: "unknown@example.org", password: process.env.APP_PASSWORD, administrator: true }));
    assert.equal(response.status, 401);
  });

  test("duplicate registration gives sign-in guidance", async () => {
    const response = await register(json("/api/auth/register", { name: "Asha Rao", email: " asha.rao@EXAMPLE.org ", password }));
    assert.equal(response.status, 400); assert.match((await response.json()).error, /already registered/i);
  });

  test("accounts survive a module restart when storage is persistent", async () => {
    const fresh = await import(`../src/lib/auth-store.ts?restart=${Date.now()}`);
    assert.equal((await fresh.authenticateUser(email, password))?.email, "asha.rao@example.org");
  });

  test("concurrent registrations do not lose accounts", async () => {
    await Promise.all(Array.from({ length: 5 }, (_, index) => register(json("/api/auth/register", { name: `Bulk ${index}`, email: `bulk${index}@example.org`, password: "bulk password 1" }))));
    for (let index = 0; index < 5; index += 1) assert.ok(await storedUser(`bulk${index}@example.org`));
  });
});
