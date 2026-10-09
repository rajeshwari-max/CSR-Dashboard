import { NextResponse } from "next/server";

import { registerUser } from "@/lib/auth-store";

export async function POST(request: Request) {
  const configured = process.env.APP_PASSWORD;
  if (!configured) {
    return NextResponse.json({ error: "Registration is unavailable until APP_PASSWORD is configured." }, { status: 503 });
  }

  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Complete all registration fields." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  try {
    await registerUser({ name, email, password });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, registered: true, message: "Account created. You can now sign in with your email and password." });
}
