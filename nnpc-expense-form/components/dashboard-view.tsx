"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGate from "./auth-gate";
import { formatDisplayDate } from "../lib/date";
import {
  formatCurrency,
  readExpenseSummaries,
  type ExpenseSummary,
} from "../lib/expense-data";

export default function DashboardView({
  defaultExpenseDate,
}: {
  defaultExpenseDate: string;
}) {
  return (
    <AuthGate>
      {({ logout }) => (
        <ProtectedDashboard defaultExpenseDate={defaultExpenseDate} logout={logout} />
      )}
    </AuthGate>
  );
}

function ProtectedDashboard({
  defaultExpenseDate,
  logout,
}: {
  defaultExpenseDate: string;
  logout: () => Promise<void>;
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(defaultExpenseDate);
  const [summaries] = useState<ExpenseSummary[]>(() => readExpenseSummaries());

  const matchingSummary = summaries.find((summary) => summary.date === selectedDate);

  return (
    <div className="page-shell min-h-screen">
      <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-8 lg:py-8">
        <header className="flex flex-col gap-5 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
              Dashboard
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
              Daily expense totals
            </h1>
            <p className="text-sm text-[var(--muted)]">
              Each row is one date. Open a date to edit the full expense list.
            </p>
          </div>

          <button
            className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            type="button"
            onClick={() => {
              void logout();
            }}
          >
            Log out
          </button>
        </header>

        <section className="mt-6 rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--foreground)]">
                Create expense
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Choose the day, then open that route.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 rounded-2xl bg-[var(--surface)] px-3 py-2 text-sm">
                <span className="text-[var(--muted)]">Date</span>
                <input
                  className="w-[9.5rem] bg-transparent outline-none"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </label>
              <button
                className="rounded-2xl bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-92"
                type="button"
                onClick={() => router.push(`/expense/${selectedDate}`)}
              >
                {matchingSummary ? "Open expense" : "Create expense"}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-[var(--line)] bg-[var(--card)]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-[var(--line)] px-5 py-4 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
            <span>Date</span>
            <span>Total expense</span>
          </div>

          {summaries.length === 0 ? (
            <div className="px-5 py-12 text-sm text-[var(--muted)]">
              No saved dates yet.
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {summaries.map((summary) => (
                <Link
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 py-4 text-sm transition hover:bg-[var(--surface)]"
                  href={`/expense/${summary.date}`}
                  key={summary.date}
                >
                  <span className="font-medium text-[var(--foreground)]">
                    {formatDisplayDate(summary.date)}
                  </span>
                  <span className="text-[var(--foreground)]">
                    {formatCurrency(summary.totalAmount)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
