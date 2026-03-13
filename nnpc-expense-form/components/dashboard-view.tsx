"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import AuthGate, { type AuthSession } from "@/components/auth-gate";
import { ThemeSettingsSheet } from "@/components/theme-settings-sheet";
import { TopRouteTabs } from "@/components/top-route-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { readExpenseSummariesCache, writeExpenseSummariesCache } from "@/lib/browser-cache";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/company-data";
import {
  formatDisplayDate,
  formatExpenseReferenceCode,
  getBangkokDateInputValue,
} from "@/lib/date";
import { formatCurrency, type ExpenseSummary } from "@/lib/expense-data";
import { listExpenseSummaries } from "@/lib/report-data";

export default function DashboardView() {
  return (
    <AuthGate>
      {({ session, logout }) => (
        <ProtectedDashboard logout={logout} session={session} />
      )}
    </AuthGate>
  );
}

function ProtectedDashboard({
  logout,
  session,
}: {
  logout: () => Promise<void>;
  session: AuthSession;
}) {
  const router = useRouter();
  const cacheUserKey = session.userEmail;
  const [selectedDate, setSelectedDate] = useState(() => getBangkokDateInputValue());
  const [summaries, setSummaries] = useState<ExpenseSummary[]>([]);
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const matchingSummary = summaries.find((summary) => summary.date === selectedDate);

  useEffect(() => {
    let isActive = true;
    const loadSummaries = async () => {
      const cachedSummaries = readExpenseSummariesCache(cacheUserKey);

      if (cachedSummaries) {
        if (!isActive) {
          return;
        }

        setSummaries(cachedSummaries);
        setSummaryError(null);
        return;
      }

      const nextSummaries = await listExpenseSummaries(session.accessToken);

      if (!isActive) {
        return;
      }

      setSummaries(nextSummaries);
      setSummaryError(null);
      writeExpenseSummariesCache(cacheUserKey, nextSummaries);
    };

    void loadSummaries()
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
          void logout();
          return;
        }

        setSummaryError(
          error instanceof Error
            ? error.message
            : "Expense summaries could not be loaded from Supabase.",
        );
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingSummaries(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [cacheUserKey, logout, session.accessToken]);

  return (
    <div className="page-shell min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Expenses
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {session.userEmail}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeSettingsSheet userEmail={session.userEmail} />
            <Button
              className="rounded-full border-white/10 bg-background/70 px-4 shadow-none backdrop-blur-xl hover:bg-background/90"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                void logout();
              }}
            >
              <LogOut className="size-4" />
              Log out
            </Button>
          </div>
        </header>

        <TopRouteTabs activeSection="expenses" />

        <Card className="mt-6 rounded-[1.75rem] border-border/60 py-0 shadow-none">
          <CardContent className="px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                className="h-11 rounded-2xl border-white/10 bg-background/75 px-4 sm:max-w-[11rem]"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />

              <Button
                className="h-11 rounded-2xl px-5"
                type="button"
                onClick={() =>
                  router.push(`/expense?date=${encodeURIComponent(selectedDate)}`)
                }
              >
                {matchingSummary ? "Open" : "Create"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4 rounded-[1.75rem] border-border/60 py-0 shadow-none">
          <CardContent className="px-0 py-0">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-border/60 px-4 py-3 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground sm:px-5">
              <span>Date</span>
              <span>Reference</span>
              <span>Total</span>
            </div>

            {summaryError ? (
              <div className="px-4 py-8 text-sm text-destructive sm:px-5">
                {summaryError}
              </div>
            ) : isLoadingSummaries ? (
              <div className="px-4 py-8 text-sm text-muted-foreground sm:px-5">
                Loading reports from Supabase...
              </div>
            ) : summaries.length === 0 ? (
              <div className="px-4 py-10 text-sm text-muted-foreground sm:px-5">
                No saved dates.
              </div>
            ) : (
              <div>
                {summaries.map((summary) => (
                  <Link
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-border/50 px-4 py-4 text-sm transition last:border-b-0 hover:bg-accent/40 sm:px-5"
                    href={`/expense?date=${encodeURIComponent(summary.date)}`}
                    key={summary.date}
                  >
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {formatDisplayDate(summary.date)}
                    </span>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {formatExpenseReferenceCode(summary.date, summary.expenseCode)}
                    </span>
                    <span className="text-foreground">
                      {formatCurrency(summary.totalAmount)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
