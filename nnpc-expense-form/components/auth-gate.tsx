"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { ThemeSettingsSheet } from "@/components/theme-settings-sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
        <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-8 sm:px-6">
          <Card className="premium-panel w-full max-w-lg rounded-[2rem] border-border/60 py-0">
            <CardContent className="px-6 py-12 text-center sm:px-10">
              <Badge className="rounded-full px-3 py-1" variant="secondary">
                Initializing
              </Badge>
              <p className="mt-5 font-serif text-3xl tracking-tight text-foreground">
                Loading secure workspace
              </p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Preparing the expense console and restoring any stored session.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="page-shell min-h-screen">
        <div className="mx-auto flex w-full max-w-7xl justify-end px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8">
          <ThemeSettingsSheet />
        </div>

        <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-8 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)] lg:px-8 lg:pb-10">
          <section className="premium-panel rounded-[2rem] border border-border/60 p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col gap-8">
              <div className="space-y-4">
                <Badge
                  className="rounded-full border-white/10 bg-white/5 px-4 py-1 text-[0.7rem] uppercase tracking-[0.28em] text-primary"
                  variant="outline"
                >
                  NNPC daily expense
                </Badge>

                <div className="space-y-4">
                  <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
                    Authenticated daily reimbursements
                  </p>
                  <h1 className="max-w-3xl font-serif text-4xl tracking-[-0.03em] text-foreground sm:text-5xl lg:text-6xl">
                    A cleaner way to move from totals to the full expense breakdown.
                  </h1>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                    Sign in with Supabase, select a date from the dashboard, and manage
                    all receipts and remarks in a focused single-day editor.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FeatureCard
                  title="Concise dashboard"
                  description="Track dates and totals without clutter, then open detail only when needed."
                  icon={<Wallet className="size-4" />}
                />
                <FeatureCard
                  title="Secure entry"
                  description="Email and password auth is handled directly against your Supabase project."
                  icon={<ShieldCheck className="size-4" />}
                />
                <FeatureCard
                  title="Receipt workflow"
                  description="Attach image receipts per row and keep the draft recoverable in local storage."
                  icon={<Sparkles className="size-4" />}
                />
                <FeatureCard
                  title="Theme control"
                  description="Dark mode is the default canvas, with a light mode toggle in Settings."
                  icon={<LockKeyhole className="size-4" />}
                />
              </div>

              <div className="rounded-3xl border border-white/10 bg-background/65 px-5 py-5">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  Prototype behavior
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  Local browser storage keeps the expense drafts. Authentication still
                  depends on your Supabase URL and publishable key from `.env.local`.
                </p>
              </div>
            </div>
          </section>

          <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
            <CardHeader className="gap-5 border-b border-border/60 px-6 py-6">
              <div className="flex items-center gap-1 rounded-full border border-white/10 bg-background/70 p-1">
                <Button
                  className={cn(
                    "h-10 flex-1 rounded-full px-4 shadow-none",
                    authMode !== "login" &&
                      "bg-transparent text-muted-foreground hover:bg-background/80 hover:text-foreground",
                  )}
                  type="button"
                  variant={authMode === "login" ? "default" : "ghost"}
                  onClick={() => {
                    setAuthMode("login");
                    setAuthMessage(null);
                  }}
                >
                  Log in
                </Button>
                <Button
                  className={cn(
                    "h-10 flex-1 rounded-full px-4 shadow-none",
                    authMode !== "signup" &&
                      "bg-transparent text-muted-foreground hover:bg-background/80 hover:text-foreground",
                  )}
                  type="button"
                  variant={authMode === "signup" ? "default" : "ghost"}
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthMessage(null);
                  }}
                >
                  Sign up
                </Button>
              </div>

              <div className="space-y-2">
                <CardTitle className="font-serif text-3xl tracking-tight">
                  {authMode === "login" ? "Access the dashboard" : "Create your workspace"}
                </CardTitle>
                <CardDescription className="text-sm leading-7">
                  Supabase email/password authentication only. The interface stays
                  mobile-friendly and dark-first after sign-in.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="px-6 py-6">
              <form className="space-y-5" onSubmit={handleAuthSubmit}>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Email</span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-12 rounded-2xl border-white/10 bg-background/75 pl-11"
                      type="email"
                      autoComplete="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Password</span>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-12 rounded-2xl border-white/10 bg-background/75 pl-11"
                      type="password"
                      autoComplete={
                        authMode === "login" ? "current-password" : "new-password"
                      }
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                </label>

                {authMessage ? (
                  <Alert
                    className={cn(
                      "rounded-2xl border-white/10",
                      authMessage.tone === "error"
                        ? "border-destructive/30 bg-destructive/10"
                        : "bg-background/70",
                    )}
                    variant={authMessage.tone === "error" ? "destructive" : "default"}
                  >
                    <AlertTitle>
                      {authMessage.tone === "error" ? "Authentication issue" : "Next step"}
                    </AlertTitle>
                    <AlertDescription>{authMessage.text}</AlertDescription>
                  </Alert>
                ) : null}

                <Button
                  className="h-12 w-full rounded-2xl text-sm"
                  disabled={isSubmittingAuth}
                  type="submit"
                >
                  {isSubmittingAuth
                    ? "Working..."
                    : authMode === "login"
                      ? "Log in"
                      : "Create account"}
                  <ArrowRight className="size-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return <>{children({ session, logout })}</>;
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-background/65 p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          {icon}
        </span>
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
    </div>
  );
}
