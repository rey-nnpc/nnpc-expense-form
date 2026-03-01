"use client";

import { startTransition, useEffect, useState } from "react";

type AuthMode = "login" | "signup";

type ExpenseType = {
  id: string;
  label: string;
};

type ReceiptDraft = {
  id: string;
  name: string;
  sizeLabel: string;
};

type ExpenseRow = {
  id: number;
  typeId: string;
  amount: string;
  remark: string;
  receipts: ReceiptDraft[];
};

type AuthSession = {
  accessToken: string;
  userEmail: string;
};

type AuthMessage = {
  tone: "error" | "info";
  text: string;
};

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

const EXPENSE_TYPES: ExpenseType[] = [
  { id: "transportation", label: "Transportation" },
  { id: "client_food", label: "Client food" },
  { id: "gas", label: "Gas" },
  { id: "toll_fee", label: "Toll fee" },
  { id: "misc", label: "Miscellaneous" },
];

const AUTH_STORAGE_KEY = "nnpc-expense-auth-session";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

function createEmptyRow(id: number): ExpenseRow {
  return {
    id,
    typeId: EXPENSE_TYPES[0]?.id ?? "misc",
    amount: "",
    remark: "",
    receipts: [],
  };
}

function hasRowContent(row: ExpenseRow) {
  return row.amount.trim() !== "" || row.remark.trim() !== "" || row.receipts.length > 0;
}

function parseAmount(value: string) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return numericValue;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatFileSize(fileSizeBytes: number) {
  if (fileSizeBytes < 1024) {
    return `${fileSizeBytes} B`;
  }

  if (fileSizeBytes < 1024 * 1024) {
    return `${Math.round(fileSizeBytes / 1024)} KB`;
  }

  return `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDisplayDate(value: string) {
  if (!value) {
    return "No date selected";
  }

  const parsedDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
  }).format(parsedDate);
}

function deriveDisplayName(email: string) {
  const localPart = email.split("@")[0] ?? "";

  if (!localPart) {
    return "Expense owner";
  }

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function readErrorMessage(payload: AuthPayload) {
  return (
    payload.error_description ??
    payload.msg ??
    payload.message ??
    "Supabase authentication failed."
  );
}

export default function ExpensePrototype({
  defaultExpenseDate,
}: {
  defaultExpenseDate: string;
}) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [authMessage, setAuthMessage] = useState<AuthMessage | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [expenseDate, setExpenseDate] = useState(defaultExpenseDate);
  const [employeeName, setEmployeeName] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ExpenseRow[]>(() => [createEmptyRow(1)]);
  const [lastPrintedAt, setLastPrintedAt] = useState<string | null>(null);

  useEffect(() => {
    const storedSession = window.localStorage.getItem(AUTH_STORAGE_KEY);

    if (!storedSession) {
      return;
    }

    try {
      const parsedSession = JSON.parse(storedSession) as AuthSession;
      setSession(parsedSession);
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    setEmployeeName((currentValue) =>
      currentValue.trim() ? currentValue : deriveDisplayName(session.userEmail),
    );
  }, [session]);

  const populatedRows = rows.filter(hasRowContent);
  const totalAmount = rows.reduce((sum, row) => sum + parseAmount(row.amount), 0);
  const totalReceipts = rows.reduce((sum, row) => sum + row.receipts.length, 0);
  const isAuthConfigured = SUPABASE_URL !== "" && SUPABASE_PUBLISHABLE_KEY !== "";

  const updateRow = <K extends keyof ExpenseRow,>(
    rowId: number,
    key: K,
    value: ExpenseRow[K],
  ) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: value,
            }
          : row,
      ),
    );
  };

  const addRow = () => {
    startTransition(() => {
      setRows((currentRows) => {
        const nextId =
          currentRows.length === 0
            ? 1
            : Math.max(...currentRows.map((row) => row.id)) + 1;

        return [...currentRows, createEmptyRow(nextId)];
      });
    });
  };

  const removeRow = (rowId: number) => {
    startTransition(() => {
      setRows((currentRows) => {
        if (currentRows.length === 1) {
          return [createEmptyRow(1)];
        }

        return currentRows.filter((row) => row.id !== rowId);
      });
    });
  };

  const handleReceiptChange = (rowId: number, files: FileList | null) => {
    const nextReceipts = Array.from(files ?? []).map((file, index) => ({
      id: `${rowId}-${index}-${file.name}`,
      name: file.name,
      sizeLabel: formatFileSize(file.size),
    }));

    updateRow(rowId, "receipts", nextReceipts);
  };

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setAuthMessage({
        tone: "error",
        text: "Email and password are required.",
      });
      return;
    }

    if (!isAuthConfigured) {
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

  const handleLogout = async () => {
    if (session && isAuthConfigured) {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session.accessToken}`,
          },
        });
      } catch {
        // Clearing local state is enough for the prototype.
      }
    }

    setSession(null);
    setPassword("");
    setAuthMode("login");
    setAuthMessage(null);
    setExpenseDate(defaultExpenseDate);
    setEmployeeName("");
    setNote("");
    setRows([createEmptyRow(1)]);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const handlePrint = () => {
    const printedAt = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());

    setLastPrintedAt(printedAt);
    window.print();
  };

  if (!session) {
    return (
      <div className="page-shell min-h-screen">
        <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-8">
          <section className="flex flex-col justify-between rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-8 sm:p-10">
            <div className="space-y-10">
              <div className="space-y-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                  NNPC Daily Expense
                </p>
                <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-5xl">
                  One date. All expenses. One clean reimbursement sheet.
                </h1>
                <p className="max-w-xl text-base leading-8 text-[var(--muted)]">
                  Log in with Supabase email and password, pick the day, then add
                  every expense line under that single date. No duplicate forms.
                </p>
              </div>

              <div className="grid gap-3 sm:max-w-xl">
                <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--foreground)]">
                  The form is centered around one expense date only.
                </div>
                <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--foreground)]">
                  Add lines as needed with a single inline “Add new expense” action.
                </div>
                <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-sm text-[var(--foreground)]">
                  Print the finished day into one PDF or paper form.
                </div>
              </div>
            </div>

            <div className="mt-10 border-t border-[var(--line)] pt-5 text-sm text-[var(--muted)]">
              Prototype first. Data can stay mocked in the UI while auth already
              points at your Supabase project.
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
                {authMode === "login" ? "Access your daily form" : "Create your account"}
              </h2>
              <p className="text-sm leading-7 text-[var(--muted)]">
                Supabase email/password only. No extra auth providers in this flow.
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

            <p className="mt-5 text-xs leading-6 text-[var(--muted)]">
              Uses <code>NEXT_PUBLIC_SUPABASE_URL</code> and your publishable key
              from <code>.env.local</code>.
            </p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 lg:py-8">
        <section className="screen-only">
          <header className="flex flex-col gap-5 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                Daily expense sheet
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                {formatDisplayDate(expenseDate)}
              </h1>
              <p className="text-sm text-[var(--muted)]">
                Every line below belongs to this date only.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm">
                <span className="text-[var(--muted)]">Date</span>
                <input
                  className="bg-transparent outline-none"
                  type="date"
                  value={expenseDate}
                  onChange={(event) => setExpenseDate(event.target.value)}
                />
              </label>

              <button
                className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface)]"
                type="button"
                onClick={handlePrint}
              >
                Print / PDF
              </button>

              <button
                className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                type="button"
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          </header>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[var(--foreground)]">
              {employeeName || deriveDisplayName(session.userEmail)}
            </span>
            <span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[var(--muted)]">
              {session.userEmail}
            </span>
            <span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[var(--muted)]">
              {rows.length} line{rows.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[var(--muted)]">
              {totalReceipts} receipt{totalReceipts === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-[var(--foreground)] px-3 py-1.5 text-white">
              {formatCurrency(totalAmount)}
            </span>
          </div>

          <main className="mt-8 space-y-6">
            <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)]">
              <div className="border-b border-[var(--line)] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">
                      Expenses
                    </h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Minimal entry flow. Add only what happened on this day.
                    </p>
                  </div>
                  <button
                    className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--line)]"
                    type="button"
                    onClick={addRow}
                  >
                    + Add new expense
                  </button>
                </div>
              </div>

              <div className="px-5 py-2">
                {rows.map((row) => (
                  <div
                    className="grid gap-4 border-b border-[var(--line)] py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_12rem]"
                    key={row.id}
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <select
                          className="min-w-44 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground)] outline-none"
                          value={row.typeId}
                          onChange={(event) =>
                            updateRow(row.id, "typeId", event.target.value)
                          }
                        >
                          {EXPENSE_TYPES.map((expenseType) => (
                            <option key={expenseType.id} value={expenseType.id}>
                              {expenseType.label}
                            </option>
                          ))}
                        </select>

                        <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                          Line {row.id}
                        </span>
                      </div>

                      <input
                        className="w-full rounded-2xl border border-[var(--line)] bg-transparent px-0 py-1 text-sm outline-none placeholder:text-[var(--muted)]"
                        type="text"
                        placeholder="Remark, route, client, or purpose"
                        value={row.remark}
                        onChange={(event) =>
                          updateRow(row.id, "remark", event.target.value)
                        }
                      />

                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--surface)]">
                          <span>Attach receipts</span>
                          <input
                            className="hidden"
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(event) =>
                              handleReceiptChange(row.id, event.target.files)
                            }
                          />
                        </label>

                        {row.receipts.length === 0 ? (
                          <span className="text-xs text-[var(--muted)]">
                            No receipts yet
                          </span>
                        ) : (
                          row.receipts.map((receipt) => (
                            <span
                              className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground)]"
                              key={receipt.id}
                            >
                              {receipt.name} · {receipt.sizeLabel}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-3 md:flex-col md:items-end">
                      <input
                        className="w-40 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-right text-sm font-medium outline-none"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={row.amount}
                        onChange={(event) =>
                          updateRow(row.id, "amount", event.target.value)
                        }
                      />

                      <button
                        className="text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
                        type="button"
                        onClick={() => removeRow(row.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-5">
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                      Employee name
                    </span>
                    <input
                      className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm outline-none"
                      type="text"
                      placeholder="Who is submitting this day"
                      value={employeeName}
                      onChange={(event) => setEmployeeName(event.target.value)}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                      Note
                    </span>
                    <textarea
                      className="min-h-28 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm outline-none"
                      placeholder="Optional note for approval or accounting"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                </div>

                <div className="rounded-3xl bg-[var(--surface)] p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Day total
                  </p>
                  <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                    {formatCurrency(totalAmount)}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                    {populatedRows.length} filled line
                    {populatedRows.length === 1 ? "" : "s"} ready for export.
                  </p>
                  <p className="mt-4 text-xs text-[var(--muted)]">
                    Last print: {lastPrintedAt ?? "Not printed yet"}
                  </p>
                </div>
              </div>
            </section>
          </main>
        </section>

        <section className="print-only print-card rounded-none bg-white p-8">
          <div className="border-b border-black/10 pb-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-black/50">
              NNPC Daily Expense
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-black">
              Expense reimbursement form
            </h2>
          </div>

          <div className="mt-5 grid gap-3 text-sm text-black/70 sm:grid-cols-3">
            <div>
              <span className="block text-black/45">Date</span>
              <span className="font-medium text-black">{formatDisplayDate(expenseDate)}</span>
            </div>
            <div>
              <span className="block text-black/45">Employee</span>
              <span className="font-medium text-black">
                {employeeName || deriveDisplayName(session.userEmail)}
              </span>
            </div>
            <div>
              <span className="block text-black/45">Total</span>
              <span className="font-medium text-black">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-black/10">
            <div className="grid grid-cols-[0.8fr_1.2fr_2.2fr_1fr] gap-4 bg-black px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] text-white">
              <span>Line</span>
              <span>Type</span>
              <span>Remark</span>
              <span className="text-right">THB</span>
            </div>

            <div className="divide-y divide-black/10">
              {(populatedRows.length === 0 ? rows : populatedRows).map((row) => {
                const matchingType = EXPENSE_TYPES.find(
                  (expenseType) => expenseType.id === row.typeId,
                );

                return (
                  <div
                    className="grid grid-cols-[0.8fr_1.2fr_2.2fr_1fr] gap-4 px-4 py-3 text-sm"
                    key={row.id}
                  >
                    <span>{row.id}</span>
                    <span>{matchingType?.label ?? "Miscellaneous"}</span>
                    <span>{row.remark || "-"}</span>
                    <span className="text-right">
                      {row.amount ? formatCurrency(parseAmount(row.amount)) : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 text-sm leading-7 text-black/70">
            <span className="font-medium text-black">Note:</span>{" "}
            {note || "No additional note."}
          </div>
        </section>
      </div>
    </div>
  );
}
