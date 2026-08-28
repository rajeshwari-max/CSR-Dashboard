"use client";

import * as React from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Sign-in failed.");
      const destination = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.assign(destination.startsWith("/") ? destination : "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark">CMS</span>
          <div>
            <strong>CMS</strong>
            <span>CSR Intelligence Platform</span>
          </div>
        </div>

        <div className="login-icon"><LockKeyhole width={22} height={22} /></div>
        <p className="login-eyebrow">Secure dashboard access</p>
        <h1 id="login-title">Sign in to continue</h1>
        <p className="login-copy">Use the password supplied by your dashboard administrator.</p>

        <form onSubmit={submit} className="login-form">
          <label htmlFor="dashboard-password">Password</label>
          <div className="login-input-wrap">
            <input
              id="dashboard-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff width={16} height={16} /> : <Eye width={16} height={16} />}
            </button>
          </div>
          {error ? <p className="login-error" role="alert">{error}</p> : null}
          <button type="submit" className="login-submit" disabled={busy || !password}>
            {busy ? "Signing in…" : "Sign in"}
            {!busy ? <ArrowRight width={16} height={16} /> : null}
          </button>
        </form>

        <p className="login-security"><ShieldCheck width={14} height={14} /> Secure, HTTP-only session</p>
      </section>
    </main>
  );
}
