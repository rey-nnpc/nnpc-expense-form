"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  LockKeyhole,
  LogOut,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/supabase-api";
import {
  getCurrentUserAccount,
  type AccountRole,
  type UserAccount,
} from "@/lib/user-account-data";
import { cn } from "@/lib/utils";

type AuthMode = "login" | "signup";

type AuthPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  session?: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
  };
  user?: {
    email?: string;
  };
  message?: string;
  msg?: string;
  error_description?: string;
};

type AuthHashPayload = AuthPayload & {
  type?: string;
};

type AuthMessage = {
  text: string;
  tone: "error" | "info";
};

export type AuthSession = {
  accessToken: string;
  expiresAt: number | null;
  refreshToken: string;
  userEmail: string;
};

const AUTH_STORAGE_KEY = "nnpc-expense-auth-session";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";
const SESSION_EXPIRED_COPY = "Your session expired. Log in again.";
const ACCOUNT_REFRESH_INTERVAL_MS = 60_000;

function decodeAccessTokenPayload(accessToken: string) {
  const [, payloadSegment] = accessToken.split(".");

  if (!payloadSegment) {
    return null;
  }

  try {
    const paddedSegment = payloadSegment.padEnd(
      payloadSegment.length + ((4 - (payloadSegment.length % 4)) % 4),
      "=",
    );
    const normalizedSegment = paddedSegment.replace(/-/g, "+").replace(/_/g, "/");

    return JSON.parse(globalThis.atob(normalizedSegment)) as {
      email?: string;
      exp?: number;
    };
  } catch {
    return null;
  }
}

function readErrorMessage(payload: AuthPayload) {
  return (
    payload.error_description ??
    payload.msg ??
    payload.message ??
    "Supabase authentication failed."
  );
}

function readHashNumber(params: URLSearchParams, key: string) {
  const value = params.get(key);

  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function readHashAuthPayload(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  const accessToken = params.get("access_token");
  const errorDescription = params.get("error_description");
  const message = params.get("message");

  if (!accessToken && !errorDescription && !message) {
    return null;
  }

  const email = params.get("email");

  return {
    access_token: accessToken ?? undefined,
    error_description: errorDescription ?? undefined,
    expires_at: readHashNumber(params, "expires_at"),
    expires_in: readHashNumber(params, "expires_in"),
    message: message ?? undefined,
    refresh_token: params.get("refresh_token") ?? undefined,
    type: params.get("type") ?? undefined,
    user: email ? { email } : undefined,
  } satisfies AuthHashPayload;
}

function clearLocationHash() {
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
}

function readStoredSession(rawValue: string) {
  const parsedValue = JSON.parse(rawValue) as Partial<AuthSession>;

  if (
    typeof parsedValue.accessToken !== "string" ||
    typeof parsedValue.userEmail !== "string"
  ) {
    return null;
  }

  return {
    accessToken: parsedValue.accessToken,
    refreshToken:
      typeof parsedValue.refreshToken === "string" ? parsedValue.refreshToken : "",
    userEmail: parsedValue.userEmail,
    expiresAt:
      typeof parsedValue.expiresAt === "number"
        ? parsedValue.expiresAt
        : deriveAccessTokenExpiry(parsedValue.accessToken),
  } satisfies AuthSession;
}

function deriveAccessTokenExpiry(accessToken: string) {
  const decodedPayload = decodeAccessTokenPayload(accessToken);

  return typeof decodedPayload?.exp === "number" ? decodedPayload.exp : null;
}

function deriveAccessTokenEmail(accessToken: string) {
  const decodedPayload = decodeAccessTokenPayload(accessToken);

  return typeof decodedPayload?.email === "string" ? decodedPayload.email : "";
}

function buildAuthSession({
  fallbackEmail,
  payload,
  previousSession,
}: {
  fallbackEmail: string;
  payload: AuthPayload;
  previousSession?: AuthSession | null;
}) {
  const accessToken = payload.access_token ?? payload.session?.access_token ?? "";

  if (!accessToken) {
    return null;
  }

  const expiresIn = payload.expires_in ?? payload.session?.expires_in;
  const nextUserEmail =
    payload.user?.email ??
    previousSession?.userEmail ??
    fallbackEmail;

  return {
    accessToken,
    refreshToken:
      payload.refresh_token ??
      payload.session?.refresh_token ??
      previousSession?.refreshToken ??
      "",
    userEmail: nextUserEmail || deriveAccessTokenEmail(accessToken),
    expiresAt:
      payload.expires_at ??
      payload.session?.expires_at ??
      (typeof expiresIn === "number"
        ? Math.floor(Date.now() / 1000) + expiresIn
        : deriveAccessTokenExpiry(accessToken)),
  } satisfies AuthSession;
}

function shouldRefreshSession(session: AuthSession) {
  if (!session.refreshToken || !session.expiresAt) {
    return false;
  }

  return Date.now() >= session.expiresAt * 1000 - 60_000;
}

function isSessionExpired(session: AuthSession) {
  if (!session.expiresAt) {
    return false;
  }

  return Date.now() >= session.expiresAt * 1000 - 15_000;
}

function isSessionExpiredError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message === SESSION_EXPIRED_COPY || error.message === SESSION_EXPIRED_MESSAGE)
  );
}

async function requestSessionRefresh(currentSession: AuthSession) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !currentSession.refreshToken) {
    throw new Error(SESSION_EXPIRED_COPY);
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh_token: currentSession.refreshToken,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as AuthPayload;

  if (!response.ok) {
    throw new Error(readErrorMessage(payload));
  }

  const nextSession = buildAuthSession({
    fallbackEmail: currentSession.userEmail,
    payload,
    previousSession: currentSession,
  });

  if (!nextSession) {
    throw new Error(SESSION_EXPIRED_COPY);
  }

  return nextSession;
}

export default function AuthGate({
  allowedRoles,
  children,
}: {
  allowedRoles?: AccountRole[];
  children: (auth: {
    account: UserAccount;
    logout: () => Promise<void>;
    refreshAccount: () => Promise<void>;
    session: AuthSession;
  }) => ReactNode;
}) {
  const [isReady, setIsReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isSubmittingRecovery, setIsSubmittingRecovery] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isSubmittingResetPassword, setIsSubmittingResetPassword] = useState(false);
  const [authMessage, setAuthMessage] = useState<AuthMessage | null>(null);
  const [resetPasswordEmail, setResetPasswordEmail] = useState("");
  const [resetPasswordMessage, setResetPasswordMessage] = useState<AuthMessage | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryPasswordConfirmation, setRecoveryPasswordConfirmation] = useState("");
  const [recoverySession, setRecoverySession] = useState<AuthSession | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [accountMessage, setAccountMessage] = useState<AuthMessage | null>(null);
  const [isResolvingAccount, setIsResolvingAccount] = useState(false);
  const [accountRefreshNonce, setAccountRefreshNonce] = useState(0);

  const persistSession = (nextSession: AuthSession) => {
    setSession(nextSession);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
  };

  const clearSession = (message: AuthMessage | null = null) => {
    setSession(null);
    setAccount(null);
    setAccountMessage(null);
    setIsResetPasswordDialogOpen(false);
    setIsSubmittingResetPassword(false);
    setResetPasswordEmail("");
    setResetPasswordMessage(null);
    setRecoverySession(null);
    setRecoveryPassword("");
    setRecoveryPasswordConfirmation("");
    setPassword("");
    setAuthMode("login");
    setAuthMessage(message);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const refreshAccount = async () => {
    setAccountRefreshNonce((currentNonce) => currentNonce + 1);
  };

  useEffect(() => {
    let isActive = true;

    const restoreSession = async () => {
      const hashPayload = readHashAuthPayload(window.location.hash);

      if (hashPayload) {
        clearLocationHash();

        if (!hashPayload.access_token) {
          if (isActive) {
            setAuthMode("login");
            setAuthMessage({
              tone: "error",
              text: readErrorMessage(hashPayload),
            });
            setIsReady(true);
          }
          return;
        }

        const nextHashSession = buildAuthSession({
          fallbackEmail: "",
          payload: hashPayload,
        });

        if (!nextHashSession) {
          if (isActive) {
            setAuthMessage({
              tone: "error",
              text: "The recovery link is invalid or expired. Request a new password reset email.",
            });
            setIsReady(true);
          }
          return;
        }

        if (hashPayload.type === "recovery") {
          window.localStorage.removeItem(AUTH_STORAGE_KEY);

          if (isActive) {
            setSession(null);
            setAccount(null);
            setAccountMessage(null);
            setRecoverySession(nextHashSession);
            setRecoveryPassword("");
            setRecoveryPasswordConfirmation("");
            setEmail(nextHashSession.userEmail);
            setPassword("");
            setAuthMode("login");
            setAuthMessage({
              tone: "info",
              text: "Choose a new password to finish resetting your account.",
            });
            setIsReady(true);
          }
          return;
        }

        if (isActive) {
          persistSession(nextHashSession);
          setRecoverySession(null);
          setAuthMessage(
            hashPayload.type === "signup"
              ? {
                  tone: "info",
                  text: "Email confirmed. Access stays pending until an admin approves your account.",
                }
              : null,
          );
          setIsReady(true);
        }
        return;
      }

      const storedSession = window.localStorage.getItem(AUTH_STORAGE_KEY);

      if (!storedSession) {
        if (isActive) {
          setIsReady(true);
        }
        return;
      }

      try {
        const parsedSession = readStoredSession(storedSession);

        if (!parsedSession) {
          window.localStorage.removeItem(AUTH_STORAGE_KEY);

          if (isActive) {
            setIsReady(true);
          }

          return;
        }

        const nextSession = shouldRefreshSession(parsedSession)
          ? await requestSessionRefresh(parsedSession)
          : isSessionExpired(parsedSession)
            ? null
            : parsedSession;

        if (isActive) {
          if (nextSession) {
            persistSession(nextSession);
            setAuthMessage(null);
          } else {
            clearSession({
              tone: "info",
              text: SESSION_EXPIRED_COPY,
            });
          }
        }
      } catch {
        if (isActive) {
          clearSession({
            tone: "info",
            text: SESSION_EXPIRED_COPY,
          });
        }
      } finally {
        if (isActive) {
          setIsReady(true);
        }
      }
    };

    void restoreSession();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!session?.expiresAt) {
      return;
    }

    let isActive = true;

    if (!session.refreshToken) {
      const timeoutId = window.setTimeout(() => {
        if (isActive) {
          clearSession({
            tone: "info",
            text: SESSION_EXPIRED_COPY,
          });
        }
      }, Math.max(session.expiresAt * 1000 - Date.now(), 0));

      return () => {
        isActive = false;
        window.clearTimeout(timeoutId);
      };
    }

    const refreshSession = async () => {
      try {
        const nextSession = await requestSessionRefresh(session);

        if (isActive) {
          persistSession(nextSession);
          setAuthMessage(null);
        }
      } catch {
        if (isActive) {
          clearSession({
            tone: "info",
            text: SESSION_EXPIRED_COPY,
          });
        }
      }
    };

    const refreshDelayMs = Math.max(session.expiresAt * 1000 - Date.now() - 60_000, 0);

    const timeoutId = window.setTimeout(() => {
      void refreshSession();
    }, refreshDelayMs);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [session]);

  useEffect(() => {
    if (!session) {
      setAccount(null);
      setAccountMessage(null);
      setIsResolvingAccount(false);
      return;
    }

    let isActive = true;
    setIsResolvingAccount(true);

    void getCurrentUserAccount(session.accessToken)
      .then((nextAccount) => {
        if (!isActive) {
          return;
        }

        setAccount(nextAccount);
        setAccountMessage(null);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        if (isSessionExpiredError(error)) {
          clearSession({
            tone: "info",
            text: SESSION_EXPIRED_COPY,
          });
          return;
        }

        setAccount(null);
        setAccountMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Your account status could not be loaded.",
        });
      })
      .finally(() => {
        if (isActive) {
          setIsResolvingAccount(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [accountRefreshNonce, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setAccountRefreshNonce((currentNonce) => currentNonce + 1);
    }, ACCOUNT_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [session]);

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

      const nextSession = buildAuthSession({
        fallbackEmail: email.trim(),
        payload,
      });

      if (nextSession) {
        persistSession(nextSession);
        setAccount(null);
        setAccountMessage(null);
        setAuthMessage(
          authMode === "signup"
            ? {
                tone: "info",
                text: "Account created. Access stays pending until an admin approves you.",
              }
            : null,
        );
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

  const handlePasswordResetRequest = async () => {
    if (!resetPasswordEmail.trim()) {
      setResetPasswordMessage({
        tone: "error",
        text: "Enter the email address for the account you want to reset.",
      });
      return;
    }

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      setResetPasswordMessage({
        tone: "error",
        text: "Missing Supabase URL or publishable key in .env.local.",
      });
      return;
    }

    setIsSubmittingResetPassword(true);
    setResetPasswordMessage(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: resetPasswordEmail.trim(),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as AuthPayload;

      if (!response.ok) {
        setResetPasswordMessage({
          tone: "error",
          text: readErrorMessage(payload),
        });
        return;
      }

      setEmail(resetPasswordEmail.trim());
      setIsResetPasswordDialogOpen(false);
      setResetPasswordEmail("");
      setResetPasswordMessage(null);
      setAuthMessage({
        tone: "info",
        text: "Password reset email sent. Open the link from your inbox to choose a new password.",
      });
    } catch {
      setResetPasswordMessage({
        tone: "error",
        text: "The reset request could not reach Supabase. Check your project URL and network access.",
      });
    } finally {
      setIsSubmittingResetPassword(false);
    }
  };

  const handleRecoverySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!recoverySession) {
      setAuthMessage({
        tone: "error",
        text: "The recovery link is missing. Request a new password reset email.",
      });
      return;
    }

    if (recoveryPassword.length < 8) {
      setAuthMessage({
        tone: "error",
        text: "Use at least 8 characters for the new password.",
      });
      return;
    }

    if (recoveryPassword !== recoveryPasswordConfirmation) {
      setAuthMessage({
        tone: "error",
        text: "The password confirmation does not match.",
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

    setIsSubmittingRecovery(true);
    setAuthMessage(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${recoverySession.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: recoveryPassword,
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

      setRecoverySession(null);
      setRecoveryPassword("");
      setRecoveryPasswordConfirmation("");
      setPassword("");
      setAuthMode("login");
      setAuthMessage({
        tone: "info",
        text: "Password updated. Log in with your new password.",
      });
    } catch {
      setAuthMessage({
        tone: "error",
        text: "The password update could not reach Supabase. Request a new recovery email if needed.",
      });
    } finally {
      setIsSubmittingRecovery(false);
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
        // Local session cleanup is enough when logout cannot reach Supabase.
      }
    }

    clearSession();
  };

  if (!isReady || (session !== null && isResolvingAccount && account === null)) {
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
              <div className="mx-auto mt-6 max-w-sm space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <p className="mt-5 text-sm leading-7 text-muted-foreground">
                Preparing the expense console and restoring your access state.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!session) {
    const isRecoveryMode = recoverySession !== null;

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
                  description="Track dates and totals without clutter, then open detail only when needed."
                  icon={<Wallet className="size-4" />}
                  title="Concise dashboard"
                />
                <FeatureCard
                  description="Email and password auth is handled directly against your Supabase project."
                  icon={<ShieldCheck className="size-4" />}
                  title="Secure entry"
                />
                <FeatureCard
                  description="Attach image receipts per row and sync them to Supabase Storage and Postgres."
                  icon={<Sparkles className="size-4" />}
                  title="Receipt workflow"
                />
                <FeatureCard
                  description="Dark mode is the default canvas, with a light mode toggle in Settings."
                  icon={<LockKeyhole className="size-4" />}
                  title="Theme control"
                />
              </div>

              <div className="rounded-3xl border border-white/10 bg-background/65 px-5 py-5">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  Access workflow
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  New signups are created immediately in Supabase Auth, but app access
                  stays pending until an admin approves the account in user management.
                </p>
              </div>
            </div>
          </section>

          <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
            <CardHeader className="gap-5 border-b border-border/60 px-6 py-6">
              {isRecoveryMode ? (
                <div className="inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.24em] text-primary">
                  Password recovery
                </div>
              ) : (
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
              )}

              <div className="space-y-2">
                <CardTitle className="font-serif text-3xl tracking-tight">
                  {isRecoveryMode
                    ? "Set a new password"
                    : authMode === "login"
                      ? "Access the dashboard"
                      : "Create your workspace"}
                </CardTitle>
                <CardDescription className="text-sm leading-7">
                  {isRecoveryMode
                    ? "This recovery link came from Supabase Auth. Save a new password here, then log back in."
                    : "Supabase email/password authentication only. New accounts enter a pending approval queue before they can use the app."}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="px-6 py-6">
              <form
                className="space-y-5"
                onSubmit={isRecoveryMode ? handleRecoverySubmit : handleAuthSubmit}
              >
                {isRecoveryMode ? (
                  <>
                    <div className="rounded-2xl border border-white/10 bg-background/65 px-4 py-3 text-sm leading-6 text-muted-foreground">
                      Resetting access for{" "}
                      <span className="font-medium text-foreground">
                        {recoverySession.userEmail || "this account"}
                      </span>
                      .
                    </div>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-foreground">New password</span>
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          autoComplete="new-password"
                          className="h-12 rounded-2xl border-white/10 bg-background/75 pl-11"
                          placeholder="At least 8 characters"
                          type="password"
                          value={recoveryPassword}
                          onChange={(event) => setRecoveryPassword(event.target.value)}
                        />
                      </div>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-foreground">
                        Confirm new password
                      </span>
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          autoComplete="new-password"
                          className="h-12 rounded-2xl border-white/10 bg-background/75 pl-11"
                          placeholder="Repeat the new password"
                          type="password"
                          value={recoveryPasswordConfirmation}
                          onChange={(event) =>
                            setRecoveryPasswordConfirmation(event.target.value)
                          }
                        />
                      </div>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-foreground">Email</span>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          autoComplete="email"
                          className="h-12 rounded-2xl border-white/10 bg-background/75 pl-11"
                          placeholder="name@company.com"
                          type="email"
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
                          autoComplete={
                            authMode === "login" ? "current-password" : "new-password"
                          }
                          className="h-12 rounded-2xl border-white/10 bg-background/75 pl-11"
                          placeholder="At least 8 characters"
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                        />
                      </div>
                    </label>

                    {authMode === "login" ? (
                      <div className="flex justify-end">
                        <Button
                          className="rounded-full px-4 text-xs uppercase tracking-[0.18em]"
                          disabled={isSubmittingAuth || isSubmittingResetPassword}
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setResetPasswordEmail(email.trim());
                            setResetPasswordMessage(null);
                            setIsResetPasswordDialogOpen(true);
                          }}
                        >
                          Reset Password
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}

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
                  disabled={isRecoveryMode ? isSubmittingRecovery : isSubmittingAuth}
                  type="submit"
                >
                  {isRecoveryMode
                    ? isSubmittingRecovery
                      ? "Saving new password..."
                      : "Save new password"
                    : isSubmittingAuth
                      ? "Working..."
                      : authMode === "login"
                        ? "Log in"
                        : "Create account"}
                  <ArrowRight className="size-4" />
                </Button>

                {isRecoveryMode ? (
                  <Button
                    className="w-full rounded-2xl"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRecoverySession(null);
                      setRecoveryPassword("");
                      setRecoveryPasswordConfirmation("");
                      setAuthMessage(null);
                    }}
                  >
                    Back to login
                  </Button>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </div>

        <Dialog
          open={isResetPasswordDialogOpen}
          onOpenChange={(open) => {
            if (isSubmittingResetPassword) {
              return;
            }

            setIsResetPasswordDialogOpen(open);

            if (!open) {
              setResetPasswordMessage(null);
            }
          }}
        >
          <DialogContent
            className="rounded-[2rem] border-border/60 p-0 sm:max-w-[28rem]"
            showCloseButton={!isSubmittingResetPassword}
            onInteractOutside={(event) => {
              if (isSubmittingResetPassword) {
                event.preventDefault();
              }
            }}
          >
            <DialogHeader className="gap-3 border-b border-border/60 px-6 py-5">
              <DialogTitle className="font-serif text-3xl tracking-tight">
                Reset password
              </DialogTitle>
              <DialogDescription className="text-sm leading-7">
                Enter the email for the account. Supabase will send a recovery link so
                the user can set a new password.
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-5 px-6 py-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handlePasswordResetRequest();
              }}
            >
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">Email</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoComplete="email"
                    className="h-12 rounded-2xl border-white/10 bg-background/75 pl-11"
                    placeholder="name@company.com"
                    type="email"
                    value={resetPasswordEmail}
                    onChange={(event) => setResetPasswordEmail(event.target.value)}
                  />
                </div>
              </label>

              {resetPasswordMessage ? (
                <Alert
                  className={cn(
                    "rounded-2xl border-white/10",
                    resetPasswordMessage.tone === "error"
                      ? "border-destructive/30 bg-destructive/10"
                      : "bg-background/70",
                  )}
                  variant={resetPasswordMessage.tone === "error" ? "destructive" : "default"}
                >
                  <AlertTitle>
                    {resetPasswordMessage.tone === "error" ? "Reset issue" : "Next step"}
                  </AlertTitle>
                  <AlertDescription>{resetPasswordMessage.text}</AlertDescription>
                </Alert>
              ) : null}

              <DialogFooter className="gap-2 border-t border-border/60 px-0 pt-5">
                <Button
                  className="rounded-full"
                  disabled={isSubmittingResetPassword}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsResetPasswordDialogOpen(false);
                    setResetPasswordMessage(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="rounded-full px-5"
                  disabled={isSubmittingResetPassword}
                  type="submit"
                >
                  {isSubmittingResetPassword ? "Sending..." : "Send reset link"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (!account) {
    return (
      <AccessStateShell>
        <AccessStateCard
          description={
            accountMessage?.text ??
            "Your account status could not be resolved. Try again once the account record is available."
          }
          title="Account unavailable"
        >
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void refreshAccount()}>
              Try again
            </Button>
            <Button type="button" variant="outline" onClick={() => void logout()}>
              <LogOut className="size-4" />
              Log out
            </Button>
          </div>
        </AccessStateCard>
      </AccessStateShell>
    );
  }

  if (account.accessStatus === "pending") {
    return (
      <AccessStateShell userEmail={session.userEmail}>
        <AccessStateCard
          description="Your account is signed in, but access stays blocked until an admin approves it."
          title="Awaiting approval"
        >
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void refreshAccount()}>
              Refresh status
            </Button>
            <Button type="button" variant="outline" onClick={() => void logout()}>
              <LogOut className="size-4" />
              Log out
            </Button>
          </div>
        </AccessStateCard>
      </AccessStateShell>
    );
  }

  if (account.accessStatus === "disabled") {
    return (
      <AccessStateShell userEmail={session.userEmail}>
        <AccessStateCard
          description="This account has been disabled and cannot use the main system right now."
          title="Access disabled"
        >
          <Button type="button" variant="outline" onClick={() => void logout()}>
            <LogOut className="size-4" />
            Log out
          </Button>
        </AccessStateCard>
      </AccessStateShell>
    );
  }

  if (allowedRoles && !allowedRoles.includes(account.role)) {
    return (
      <AccessStateShell userEmail={session.userEmail}>
        <AccessStateCard
          description="Your account is approved, but this section is only available to admin roles."
          title="Access denied"
        >
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void logout()}>
              <LogOut className="size-4" />
              Log out
            </Button>
          </div>
        </AccessStateCard>
      </AccessStateShell>
    );
  }

  return <>{children({ account, logout, refreshAccount, session })}</>;
}

function AccessStateShell({
  children,
  userEmail,
}: {
  children: ReactNode;
  userEmail?: string;
}) {
  return (
    <div className="page-shell min-h-screen">
      <div className="mx-auto flex w-full max-w-7xl justify-end px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8">
        <ThemeSettingsSheet userEmail={userEmail} />
      </div>
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center px-4 pb-10 pt-4 sm:px-6">
        {children}
      </div>
    </div>
  );
}

function AccessStateCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card className="premium-panel w-full max-w-xl rounded-[2rem] border-border/60 py-0">
      <CardContent className="space-y-6 px-6 py-10 sm:px-10">
        <Badge className="rounded-full px-3 py-1" variant="secondary">
          Account state
        </Badge>
        <div>
          <h1 className="font-serif text-3xl tracking-tight text-foreground">{title}</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function FeatureCard({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
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
