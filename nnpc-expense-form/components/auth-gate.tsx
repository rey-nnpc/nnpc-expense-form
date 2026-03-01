"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

type AuthMode = "login" | "signup";

type AuthPayload = {
  access_token?: string;
  session?: {
    access_token?: string;
  };
  user?: {
    email?: string;
  };
  message?: string;
  msg?: string;
  error_description?: string;
};

type AuthMessage = {
  tone: "error" | "info";
  text: string;
};

export type AuthSession = {
  accessToken: string;
  userEmail: string;
};

const AUTH_STORAGE_KEY = "nnpc-expense-auth-session";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

function readErrorMessage(payload: AuthPayload) {
  return (
    payload.error_description ??
    payload.msg ??
    payload.message ??
    "Supabase authentication failed."
  );
}

export default function AuthGate({
  children,
}: {
  children: (auth: {
    session: AuthSession;
    logout: () => Promise<void>;
  }) => ReactNode;
}) {
  const [isReady, setIsReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [authMessage, setAuthMessage] = useState<AuthMessage | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    const storedSession = window.localStorage.getItem(AUTH_STORAGE_KEY);

    if (storedSession) {
      try {
        const parsedSession = JSON.parse(storedSession) as AuthSession;
        setSession(parsedSession);
      } catch {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }

    setIsReady(true);
  }, []);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setAuthMessage({
        tone: "error",
        text: "Email and password are required.",
      });
      return;
    }

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      setAuthMessage({
        tone: "error",
        text: "Missing Supabase URL or publishable key in .env.local.",
      });
      return;
    }

    setIsSubmittingAuth(true);
    setAuthMessage(null);

    try {
      const endpoint =
        authMode === "signup"
          ? `${SUPABASE_URL}/auth/v1/signup`
          : `${SUPABASE_URL}/auth/v1/token?grant_type=password`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as AuthPayload;

      if (!response.ok) {
        setAuthMessage({
          tone: "error",
          text: readErrorMessage(payload),
        });
        return;
      }

      const accessToken = payload.access_token ?? payload.session?.access_token ?? "";
      const userEmail = payload.user?.email ?? email.trim();

      if (accessToken) {
        const nextSession = {
          accessToken,
          userEmail,
        };

        setSession(nextSession);
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
        setAuthMessage(null);
      } else if (authMode === "signup") {
        setAuthMode("login");
        setAuthMessage({
          tone: "info",
          text:
            "Account created. If email confirmation is enabled in Supabase, confirm your email first, then log in.",
        });
      } else {
        setAuthMessage({
          tone: "error",
          text: "Login succeeded but no session token was returned.",
        });
      }

      setPassword("");
    } catch {
      setAuthMessage({
        tone: "error",
        text: "The request could not reach Supabase. Check your project URL and network access.",
      });
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const logout = async () => {
    if (session && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.accessToken}`,
          },
        });
      } catch {
        // Local session cleanup is enough for the prototype.
      }
    }

    setSession(null);
    setPassword("");
    setAuthMode("login");
    setAuthMessage(null);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  if (!isReady) {
    return (
      <div className="page-shell min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-8 text-sm text-[var(--muted)]">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="page-shell min-h-screen">
        <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-8">
          <section className="flex flex-col justify-between rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-8 sm:p-10">
            <div className="space-y-8">
              <div className="space-y-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                  NNPC Daily Expense
                </p>
                <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-5xl">
                  Daily totals on the dashboard, full detail inside each date.
                </h1>
                <p className="max-w-xl text-base leading-8 text-[var(--muted)]">
                  Sign in with Supabase, choose a date on the dashboard, then
                  open that single day to manage its expenses.
                </p>
              </div>

              <div className="grid gap-3 sm:max-w-xl">
                <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--foreground)]">
                  Dashboard shows only date and total.
                </div>
                <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--foreground)]">
                  Each date opens into its own expense route.
                </div>
                <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--foreground)]">
                  Expense rows stay compact and collapsible.
                </div>
              </div>
            </div>

            <div className="mt-10 border-t border-[var(--line)] pt-5 text-sm text-[var(--muted)]">
              Prototype data is stored locally. Authentication still uses your
              Supabase project.
            </div>
          </section>

          <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-8 sm:p-10">
            <div className="flex items-center gap-2 rounded-full bg-[var(--surface)] p-1">
              <button
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                  authMode === "login"
                    ? "bg-[var(--foreground)] text-white"
                    : "text-[var(--muted)]"
                }`}
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthMessage(null);
                }}
              >
                Log in
              </button>
              <button
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                  authMode === "signup"
                    ? "bg-[var(--foreground)] text-white"
                    : "text-[var(--muted)]"
                }`}
                type="button"
                onClick={() => {
                  setAuthMode("signup");
                  setAuthMessage(null);
                }}
              >
                Sign up
              </button>
            </div>

            <div className="mt-8 space-y-2">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--foreground)]">
                {authMode === "login" ? "Access dashboard" : "Create your account"}
              </h2>
              <p className="text-sm leading-7 text-[var(--muted)]">
                Supabase email/password only.
              </p>
            </div>

            <form className="mt-8 space-y-4" onSubmit={handleAuthSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                  Email
                </span>
                <input
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--foreground)]"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                  Password
                </span>
                <input
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm outline-none transition focus:border-[var(--foreground)]"
                  type="password"
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              {authMessage ? (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    authMessage.tone === "error"
                      ? "bg-[#fff1f1] text-[#8c2f2f]"
                      : "bg-[var(--surface)] text-[var(--foreground)]"
                  }`}
                >
                  {authMessage.text}
                </div>
              ) : null}

              <button
                className="w-full rounded-2xl bg-[var(--foreground)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={isSubmittingAuth}
              >
                {isSubmittingAuth
                  ? "Working..."
                  : authMode === "login"
                    ? "Log in"
                    : "Create account"}
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  return <>{children({ session, logout })}</>;
}
