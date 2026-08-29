import { randomBytes, scrypt as scryptCallback, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const AUTH_DIR = process.env.AUTH_DATA_DIR
  ? path.resolve(process.env.AUTH_DATA_DIR)
  : process.env.CSR_DATA_DIR
    ? path.resolve(process.env.CSR_DATA_DIR)
    : path.join(process.cwd(), "data");
const USERS_FILE = path.join(AUTH_DIR, "users.json");

interface StoredUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

async function readUsers(): Promise<StoredUser[]> {
  try {
    const content = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredUser[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function passwordHash(password: string, salt: string): Promise<Buffer> {
  return (await scrypt(password, salt, 64)) as Buffer;
}

function publicUser(user: StoredUser): AuthUser {
  return { id: user.id, name: user.name, email: user.email };
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const normalisedEmail = email.trim().toLowerCase();
  const user = (await readUsers()).find((candidate) => candidate.email === normalisedEmail);
  if (!user) return null;
  const candidate = await passwordHash(password, user.salt);
  const expected = Buffer.from(user.passwordHash, "hex");
  if (candidate.length !== expected.length || !cryptoTimingSafeEqual(candidate, expected)) return null;
  return publicUser(user);
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 80) throw new Error("Enter a valid name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    throw new Error("Enter a valid work email address.");
  }
  if (input.password.length < 10 || input.password.length > 128) {
    throw new Error("Password must contain 10 to 128 characters.");
  }

  const users = await readUsers();
  if (users.some((candidate) => candidate.email === email)) {
    throw new Error("An account already exists for this email.");
  }

  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = {
    id: randomBytes(16).toString("hex"),
    name,
    email,
    salt,
    passwordHash: (await passwordHash(input.password, salt)).toString("hex"),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await fs.mkdir(AUTH_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return publicUser(user);
}
