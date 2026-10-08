import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

/**
 * users.json lives on the persistent Render disk (CSR_DATA_DIR=/var/data) unless
 * AUTH_DATA_DIR overrides it. Resolved on every call so tests and diagnostics see
 * the live environment.
 */
export function authDataDir(): string {
  if (process.env.AUTH_DATA_DIR) return path.resolve(process.env.AUTH_DATA_DIR);
  if (process.env.CSR_DATA_DIR) return path.resolve(process.env.CSR_DATA_DIR);
  return path.join(process.cwd(), "data");
}
function usersFile() { return path.join(authDataDir(), "users.json"); }

/** Canonical account states shared by the API, the admin page and login. */
export type AccountStatus = "pending" | "approved" | "rejected" | "inactive";
export type ReviewDecision = "approved" | "rejected" | "inactive";
export const REVIEW_DECISIONS: readonly ReviewDecision[] = ["approved", "rejected", "inactive"];

interface StoredUser {
  id: string; name: string; email: string; passwordHash: string; salt: string; createdAt: string;
  status?: string; reviewedAt?: string; approvalEmailSentAt?: string;
  otpHash?: string; otpExpiresAt?: string; otpRequestedAt?: string; otpAttempts?: number;
}
export interface AuthUser { id: string; name: string; email: string; status: AccountStatus; createdAt: string; reviewedAt?: string; approvalEmailSentAt?: string }

export class OtpRateLimitError extends Error {
  constructor() { super("Please wait one minute before requesting another code."); this.name = "OtpRateLimitError"; }
}

/**
 * Accounts created before the approval workflow existed carry no status and were
 * already allowed in, so a missing status stays "approved". Any other unrecognised
 * value (e.g. "disabled") is treated as inactive, never as approved.
 */
export function normalizeStatus(value: unknown): AccountStatus {
  if (value === undefined || value === null || value === "") return "approved";
  const status = String(value).trim().toLowerCase();
  if (status === "approved" || status === "active") return "approved";
  if (status === "pending") return "pending";
  if (status === "rejected") return "rejected";
  return "inactive";
}

function normalizeEmail(email: string) { return email.trim().toLowerCase(); }
function findByEmail(users: StoredUser[], email: string) { const wanted = normalizeEmail(email); return users.find((candidate) => normalizeEmail(candidate.email) === wanted); }

async function readUsers(): Promise<StoredUser[]> {
  let raw: string;
  try { raw = await fs.readFile(usersFile(), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  // A corrupt file must never be treated as "no users": the next write would wipe every account.
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${usersFile()} does not contain a user list.`);
  return parsed as StoredUser[];
}

/** Write to a temp file then rename, so a crash or restart mid-write cannot truncate users.json. */
async function writeUsers(users: StoredUser[]) {
  const file = usersFile(); await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(users, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temp, file);
}

/**
 * Every read-modify-write of users.json runs through this queue. Without it, an
 * approval racing a registration or an OTP request could overwrite the file with a
 * stale copy and silently undo the approval.
 */
let queue: Promise<unknown> = Promise.resolve();
function withUsers<T>(task: (users: StoredUser[]) => Promise<T>): Promise<T> {
  const run = queue.then(async () => task(await readUsers()));
  queue = run.catch(() => undefined);
  return run;
}

async function passwordHash(password: string, salt: string): Promise<Buffer> { return await scrypt(password, salt, 64) as Buffer; }
function publicUser(user: StoredUser): AuthUser {
  return { id: user.id, name: user.name, email: user.email, status: normalizeStatus(user.status), createdAt: user.createdAt, reviewedAt: user.reviewedAt, approvalEmailSentAt: user.approvalEmailSentAt };
}
function clearOtp(user: StoredUser) { delete user.otpHash; delete user.otpExpiresAt; delete user.otpAttempts; }

/** Returns the account when the password matches, whatever its status; callers decide whether that status may sign in. */
export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const user = findByEmail(await readUsers(), email);
  if (!user || !user.salt || !user.passwordHash) return null;
  const candidate = await passwordHash(password, user.salt); const expected = Buffer.from(user.passwordHash, "hex");
  return candidate.length === expected.length && cryptoTimingSafeEqual(candidate, expected) ? publicUser(user) : null;
}

export async function registerUser(input: { name: string; email: string; password: string }): Promise<AuthUser> {
  const name = input.name.trim(); const email = normalizeEmail(input.email);
  if (name.length < 2 || name.length > 80) throw new Error("Enter a valid name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new Error("Enter a valid work email address.");
  if (input.password.length < 10 || input.password.length > 128) throw new Error("Password must contain 10 to 128 characters.");
  const salt = randomBytes(16).toString("hex"); const hash = (await passwordHash(input.password, salt)).toString("hex");
  return withUsers(async (users) => {
    if (findByEmail(users, email)) throw new Error("An account already exists for this email.");
    const user: StoredUser = { id: randomBytes(16).toString("hex"), name, email, salt, passwordHash: hash, createdAt: new Date().toISOString(), status: "pending" };
    users.push(user); await writeUsers(users); return publicUser(user);
  });
}

export async function listUsers(): Promise<AuthUser[]> { return (await readUsers()).map(publicUser).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export async function findUserById(id: string): Promise<AuthUser | null> { const user = (await readUsers()).find((candidate) => candidate.id === id); return user ? publicUser(user) : null; }

/** Persists an administrator decision. Re-saving the same decision is a no-op (changed: false). */
export async function reviewUser(id: string, status: ReviewDecision): Promise<{ user: AuthUser; previousStatus: AccountStatus; changed: boolean } | null> {
  return withUsers(async (users) => {
    const user = users.find((candidate) => candidate.id === id); if (!user) return null;
    const previousStatus = normalizeStatus(user.status);
    if (previousStatus === status && user.status === status) return { user: publicUser(user), previousStatus, changed: false };
    user.status = status; user.reviewedAt = new Date().toISOString(); clearOtp(user); delete user.otpRequestedAt;
    // Leaving "approved" resets the notice so a later re-approval is announced again.
    if (status !== "approved") delete user.approvalEmailSentAt;
    await writeUsers(users);
    return { user: publicUser(user), previousStatus, changed: previousStatus !== status };
  });
}

/** Records that the approval notice was delivered, which is what prevents duplicate emails. */
export async function markApprovalEmailSent(id: string): Promise<AuthUser | null> {
  return withUsers(async (users) => {
    const user = users.find((candidate) => candidate.id === id); if (!user) return null;
    if (normalizeStatus(user.status) === "approved" && !user.approvalEmailSentAt) { user.approvalEmailSentAt = new Date().toISOString(); await writeUsers(users); }
    return publicUser(user);
  });
}

function hashOtp(user: StoredUser, code: string, secret: string) { return createHash("sha256").update(`${user.id}:${code}:${secret}`).digest("hex"); }

export async function createLoginOtp(email: string, secret: string): Promise<{ code: string; user: AuthUser }> {
  return withUsers(async (users) => {
    const user = findByEmail(users, email); if (!user || normalizeStatus(user.status) !== "approved") throw new Error("Account not found.");
    const lastRequest = user.otpRequestedAt ? Date.parse(user.otpRequestedAt) : 0; if (Date.now() - lastRequest < 60_000) throw new OtpRateLimitError();
    const code = randomInt(100000, 1000000).toString(); user.otpHash = hashOtp(user, code, secret); user.otpExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString(); user.otpRequestedAt = new Date().toISOString(); user.otpAttempts = 0;
    await writeUsers(users); return { code, user: publicUser(user) };
  });
}

/** Called when the code email could not be sent, so the user can retry immediately instead of hitting the one-minute limit. */
export async function cancelLoginOtp(email: string): Promise<void> {
  await withUsers(async (users) => { const user = findByEmail(users, email); if (!user) return; clearOtp(user); delete user.otpRequestedAt; await writeUsers(users); });
}

export async function verifyLoginOtp(email: string, code: string, secret: string): Promise<AuthUser | null> {
  return withUsers(async (users) => {
    const user = findByEmail(users, email);
    if (!user || normalizeStatus(user.status) !== "approved" || !user.otpHash || !user.otpExpiresAt || Date.now() > Date.parse(user.otpExpiresAt) || (user.otpAttempts ?? 0) >= 5) return null;
    user.otpAttempts = (user.otpAttempts ?? 0) + 1; const valid = cryptoTimingSafeEqual(Buffer.from(hashOtp(user, code, secret)), Buffer.from(user.otpHash));
    if (valid) clearOtp(user); await writeUsers(users); return valid ? publicUser(user) : null;
  });
}

export async function resetUserPassword(email: string, code: string, newPassword: string, secret: string): Promise<AuthUser | null> {
  if (newPassword.length < 10 || newPassword.length > 128) throw new Error("Password must contain 10 to 128 characters.");
  const salt = randomBytes(16).toString("hex"); const hash = (await passwordHash(newPassword, salt)).toString("hex");
  return withUsers(async (users) => {
    const user = findByEmail(users, email);
    if (!user || normalizeStatus(user.status) !== "approved" || !user.otpHash || !user.otpExpiresAt || Date.now() > Date.parse(user.otpExpiresAt) || (user.otpAttempts ?? 0) >= 5) return null;
    user.otpAttempts = (user.otpAttempts ?? 0) + 1;
    const valid = cryptoTimingSafeEqual(Buffer.from(hashOtp(user, code, secret)), Buffer.from(user.otpHash));
    if (!valid) { await writeUsers(users); return null; }
    user.salt = salt; user.passwordHash = hash; clearOtp(user); await writeUsers(users); return publicUser(user);
  });
}

/** Non-secret facts an administrator can use to confirm production storage is persistent. */
export async function storageDiagnostics(): Promise<{ authDataDir: string; usersFileExists: boolean; writable: boolean; separateVolume: boolean | null }> {
  const dir = authDataDir(); let usersFileExists = false; let writable = false; let separateVolume: boolean | null = null;
  try { await fs.access(usersFile()); usersFileExists = true; } catch { /* not created yet */ }
  try { await fs.mkdir(dir, { recursive: true }); await fs.access(dir, fsConstants.W_OK); writable = true; } catch { /* reported below */ }
  try { const [data, app] = await Promise.all([fs.stat(dir), fs.stat(process.cwd())]); separateVolume = data.dev !== app.dev; } catch { /* unknown */ }
  return { authDataDir: dir, usersFileExists, writable, separateVolume };
}
