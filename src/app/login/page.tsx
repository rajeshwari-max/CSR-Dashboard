"use client";

import * as React from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";

type AuthMode = "signin" | "register";

export default function LoginPage() {
  const [mode, setMode] = React.useState<AuthMode>("signin");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${mode === "signin" ? "login" : "register"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "signin"
            ? { email, password }
            : { name, email, password },
        ),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? (mode === "signin" ? "Sign-in failed." : "Registration failed."));
      }
      const destination = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.assign(destination.startsWith("/") ? destination : "/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
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
        <h1 id="login-title">{mode === "signin" ? "Welcome back" : "Create an account"}</h1>
        <p className="login-copy">
          {mode === "signin"
            ? "Sign in with a registered account, or leave email blank to use the administrator password."
            : "Create an account using your email address and a password of your choice."}
        </p>

        <div className="login-tabs" role="tablist" aria-label="Authentication options">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "active" : ""}
            onClick={() => switchMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => switchMode("register")}
          >
            Register
          </button>
        </div>

        <form onSubmit={submit} className="login-form">
          {mode === "register" ? (
            <>
              <label htmlFor="register-name">Full name</label>
              <div className="login-input-wrap">
                <input
                  id="register-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  autoFocus
                  required
                />
              </div>
            </>
          ) : null}

          <label htmlFor="account-email">
            Email {mode === "signin" ? <span>(optional for administrator)</span> : null}
          </label>
          <div className="login-input-wrap">
            <input
              id="account-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoFocus={mode === "signin"}
              required={mode === "register"}
            />
          </div>

          <label htmlFor="dashboard-password">Password</label>
          <div className="login-input-wrap">
            <input
              id="dashboard-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 10 : undefined}
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

          {mode === "register" ? (
            <>
              <label htmlFor="confirm-password">Confirm password</label>
              <div className="login-input-wrap">
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
              </div>
            </>
          ) : null}

          {error ? <p className="login-error" role="alert">{error}</p> : null}
          <button
            type="submit"
            className="login-submit"
            disabled={busy || !password || (mode === "register" && (!name || !email || !confirmPassword))}
          >
            {busy
              ? (mode === "signin" ? "Signing in…" : "Creating account…")
              : (mode === "signin" ? "Sign in" : "Register")}
            {!busy ? <ArrowRight width={16} height={16} /> : null}
          </button>
        </form>

        <p className="login-security"><ShieldCheck width={14} height={14} /> Secure, HTTP-only 12-hour session</p>
      </section>
    </main>
  );
}
