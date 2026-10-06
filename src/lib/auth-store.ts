import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const AUTH_DIR = process.env.AUTH_DATA_DIR ? path.resolve(process.env.AUTH_DATA_DIR) : process.env.CSR_DATA_DIR ? path.resolve(process.env.CSR_DATA_DIR) : path.join(process.cwd(), "data");
const USERS_FILE = path.join(AUTH_DIR, "users.json");
export type AccountStatus = "pending" | "approved" | "rejected";

interface StoredUser { id: string; name: string; email: string; passwordHash: string; salt: string; createdAt: string; status?: AccountStatus; reviewedAt?: string; otpHash?: string; otpExpiresAt?: string; otpRequestedAt?: string; otpAttempts?: number }
export interface AuthUser { id: string; name: string; email: string; status: AccountStatus; createdAt: string; reviewedAt?: string }

async function readUsers(): Promise<StoredUser[]> {
  try { const parsed = JSON.parse(await fs.readFile(USERS_FILE, "utf8")) as unknown; return Array.isArray(parsed) ? parsed as StoredUser[] : []; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
async function writeUsers(users: StoredUser[]) { await fs.mkdir(AUTH_DIR, { recursive: true }); await fs.writeFile(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); }
async function passwordHash(password: string, salt: string): Promise<Buffer> { return await scrypt(password, salt, 64) as Buffer; }
function statusOf(user: StoredUser): AccountStatus { return user.status ?? "approved"; }
function publicUser(user: StoredUser): AuthUser { return { id: user.id, name: user.name, email: user.email, status: statusOf(user), createdAt: user.createdAt, reviewedAt: user.reviewedAt }; }

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const user = (await readUsers()).find((candidate) => candidate.email === email.trim().toLowerCase());
  if (!user) return null;
  const candidate = await passwordHash(password, user.salt); const expected = Buffer.from(user.passwordHash, "hex");
  return candidate.length === expected.length && cryptoTimingSafeEqual(candidate, expected) ? publicUser(user) : null;
}

export async function registerUser(input: { name: string; email: string; password: string }): Promise<AuthUser> {
  const name = input.name.trim(); const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 80) throw new Error("Enter a valid name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new Error("Enter a valid work email address.");
  if (input.password.length < 10 || input.password.length > 128) throw new Error("Password must contain 10 to 128 characters.");
  const users = await readUsers();
  if (users.some((candidate) => candidate.email === email)) throw new Error("An account already exists for this email.");
  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = { id: randomBytes(16).toString("hex"), name, email, salt, passwordHash: (await passwordHash(input.password, salt)).toString("hex"), createdAt: new Date().toISOString(), status: "pending" };
  users.push(user); await writeUsers(users); return publicUser(user);
}

export async function listUsers(): Promise<AuthUser[]> { return (await readUsers()).map(publicUser).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export async function reviewUser(id: string, status: "approved" | "rejected"): Promise<AuthUser | null> {
  const users = await readUsers(); const user = users.find((candidate) => candidate.id === id); if (!user) return null;
  user.status = status; user.reviewedAt = new Date().toISOString(); delete user.otpHash; delete user.otpExpiresAt; delete user.otpAttempts;
  await writeUsers(users); return publicUser(user);
}
function hashOtp(user: StoredUser, code: string, secret: string) { return createHash("sha256").update(`${user.id}:${code}:${secret}`).digest("hex"); }
export async function createLoginOtp(email: string, secret: string): Promise<{ code: string; user: AuthUser }> {
  const users = await readUsers(); const user = users.find((candidate) => candidate.email === email.trim().toLowerCase()); if (!user) throw new Error("Account not found.");
  const lastRequest = user.otpRequestedAt ? Date.parse(user.otpRequestedAt) : 0; if (Date.now() - lastRequest < 60_000) throw new Error("Please wait one minute before requesting another code.");
  const code = randomInt(100000, 1000000).toString(); user.otpHash = hashOtp(user, code, secret); user.otpExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString(); user.otpRequestedAt = new Date().toISOString(); user.otpAttempts = 0;
  await writeUsers(users); return { code, user: publicUser(user) };
}
export async function verifyLoginOtp(email: string, code: string, secret: string): Promise<AuthUser | null> {
  const users = await readUsers(); const user = users.find((candidate) => candidate.email === email.trim().toLowerCase());
  if (!user || statusOf(user) !== "approved" || !user.otpHash || !user.otpExpiresAt || Date.now() > Date.parse(user.otpExpiresAt) || (user.otpAttempts ?? 0) >= 5) return null;
  user.otpAttempts = (user.otpAttempts ?? 0) + 1; const valid = cryptoTimingSafeEqual(Buffer.from(hashOtp(user, code, secret)), Buffer.from(user.otpHash));
  if (valid) { delete user.otpHash; delete user.otpExpiresAt; delete user.otpAttempts; } await writeUsers(users); return valid ? publicUser(user) : null;
}


export async function resetUserPassword(email: string, code: string, newPassword: string, secret: string): Promise<AuthUser | null> {
  if (newPassword.length < 10 || newPassword.length > 128) throw new Error("Password must contain 10 to 128 characters.");
  const users = await readUsers(); const user = users.find((candidate) => candidate.email === email.trim().toLowerCase());
  if (!user || statusOf(user) !== "approved" || !user.otpHash || !user.otpExpiresAt || Date.now() > Date.parse(user.otpExpiresAt) || (user.otpAttempts ?? 0) >= 5) return null;
  user.otpAttempts = (user.otpAttempts ?? 0) + 1;
  const valid = cryptoTimingSafeEqual(Buffer.from(hashOtp(user, code, secret)), Buffer.from(user.otpHash));
  if (!valid) { await writeUsers(users); return null; }
  const salt = randomBytes(16).toString("hex"); user.salt = salt; user.passwordHash = (await passwordHash(newPassword, salt)).toString("hex");
  delete user.otpHash; delete user.otpExpiresAt; delete user.otpAttempts; await writeUsers(users); return publicUser(user);
}
