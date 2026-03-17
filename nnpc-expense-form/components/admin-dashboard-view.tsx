"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import AuthGate, { type AuthSession } from "@/components/auth-gate";
import { ThemeSettingsSheet } from "@/components/theme-settings-sheet";
import { TopRouteTabs } from "@/components/top-route-tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAdminExpenseDashboard,
  normalizeAdminPeriod,
  type AdminExpenseDashboard,
} from "@/lib/admin-data";
import { formatCurrency } from "@/lib/expense-data";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/supabase-api";

type AdminMessage = {
  tone: "error" | "info";
  text: string;
};

export default function AdminDashboardView({
  initialPeriod,
}: {
  initialPeriod: string;
}) {
  return (
    <AuthGate>
      {({ session, logout }) => (
        <ProtectedAdminDashboard
          initialPeriod={initialPeriod}
          logout={logout}
          session={session}
        />
      )}
    </AuthGate>
  );
}

function ProtectedAdminDashboard({
  initialPeriod,
  logout,
  session,
}: {
  initialPeriod: string;
  logout: () => Promise<void>;
  session: AuthSession;
}) {
  const normalizedInitialPeriod = normalizeAdminPeriod(initialPeriod);
  const [draftPeriod, setDraftPeriod] = useState(normalizedInitialPeriod);
  const [activePeriod, setActivePeriod] = useState(normalizedInitialPeriod);
  const [dashboard, setDashboard] = useState<AdminExpenseDashboard | null>(null);
  const [message, setMessage] = useState<AdminMessage | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [requestNonce, setRequestNonce] = useState(0);

  useEffect(() => {
    let isActive = true;

    const loadDashboard = async () => {
      const nextDashboard = await getAdminExpenseDashboard(session.accessToken, activePeriod);

      if (!isActive) {
        return;
      }

      setDashboard(nextDashboard);
      setDraftPeriod(nextDashboard.selectedPeriod);
      setMessage(null);
    };

    void loadDashboard()
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
          void logout();
          return;
        }

        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "The admin expense dashboard could not be loaded.",
        });
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingDashboard(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [activePeriod, logout, requestNonce, session.accessToken]);

  const handlePeriodSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setMessage(null);
    setIsLoadingDashboard(true);
    setActivePeriod(normalizeAdminPeriod(draftPeriod));
    setRequestNonce((currentNonce) => currentNonce + 1);
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 bg-background" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Admin Expenses
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{session.userEmail}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeSettingsSheet userEmail={session.userEmail} />
            <Button type="button" variant="outline" onClick={() => void logout()}>
              <LogOut className="size-4" />
              Log out
            </Button>
          </div>
        </header>

        <TopRouteTabs activeSection="admin" />

        <Card className="mt-6 border-border bg-card py-0 shadow-none">
          <CardHeader className="gap-3 border-b border-border px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="font-serif text-2xl tracking-tight">
                  User List
                </CardTitle>
                <CardDescription className="mt-1 text-sm leading-6">
                  Quick summary only. Open a user to view daily expense detail.
                </CardDescription>
              </div>

              <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handlePeriodSubmit}>
                <label className="flex min-w-[12rem] flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Month</span>
                  <Input
                    className="h-10 bg-background"
                    type="month"
                    value={draftPeriod}
                    onChange={(event) => setDraftPeriod(event.target.value)}
                  />
                </label>
                <Button type="submit">Update</Button>
              </form>
            </div>
          </CardHeader>

          {dashboard ? (
            <CardContent className="grid gap-3 px-5 py-5 sm:grid-cols-3 sm:px-6">
              <div className="rounded-lg border border-border bg-card px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Users
                </div>
                <div className="mt-2 font-serif text-3xl">{dashboard.users.length}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dashboard.totals.usersWithMonthlyExpenses} active in {dashboard.periodLabel}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Month Total
                </div>
                <div className="mt-2 font-serif text-3xl">
                  {formatCurrency(dashboard.totals.monthlyExpense)}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{dashboard.periodLabel}</p>
              </div>

              <div className="rounded-lg border border-border bg-card px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Year Total
                </div>
                <div className="mt-2 font-serif text-3xl">
                  {formatCurrency(dashboard.totals.yearlyExpense)}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{dashboard.selectedYear}</p>
              </div>
            </CardContent>
          ) : null}
        </Card>

        {message ? (
          <Alert className="mt-4 border-border bg-card" variant={message.tone === "error" ? "destructive" : "default"}>
            <AlertTitle>
              {message.tone === "error" ? "Admin Dashboard Unavailable" : "Admin Dashboard"}
            </AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="mt-4 border-border bg-card py-0 shadow-none">
          <CardContent className="px-0 py-0">
            {isLoadingDashboard ? (
              <div className="px-5 py-10 text-sm text-muted-foreground sm:px-6">
                Loading admin expense data...
              </div>
            ) : !dashboard ? (
              <div className="px-5 py-10 text-sm text-muted-foreground sm:px-6">
                No admin dashboard data available.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="px-4 py-3 sm:px-6">User</TableHead>
                    <TableHead className="px-4 py-3">Email</TableHead>
                    <TableHead className="px-4 py-3 text-right">Status</TableHead>
                    <TableHead className="px-4 py-3 text-right">{dashboard.periodLabel}</TableHead>
                    <TableHead className="px-4 py-3 text-right">
                      {dashboard.selectedYear} Total
                    </TableHead>
                    <TableHead className="px-4 py-3 text-right">Days</TableHead>
                    <TableHead className="px-4 py-3 text-right sm:px-6">Open</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {dashboard.users.length === 0 ? (
                    <TableRow>
                      <TableCell className="px-4 py-8 text-muted-foreground sm:px-6" colSpan={7}>
                        No synced user accounts were found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    dashboard.users.map((user) => (
                      <TableRow key={user.userId}>
                        <TableCell className="px-4 py-4 font-medium whitespace-normal sm:px-6">
                          {user.displayName}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-muted-foreground whitespace-normal">
                          {user.email}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right">
                          <Badge
                            className="rounded-full px-2.5 py-0.5"
                            variant={user.monthDaysWithExpenses > 0 ? "default" : "outline"}
                          >
                            {user.monthDaysWithExpenses > 0 ? "Active" : "No Spend"}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right font-medium">
                          {formatCurrency(user.monthlyExpense)}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right font-medium">
                          {formatCurrency(user.yearlyExpense)}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right">
                          {user.monthDaysWithExpenses}
                        </TableCell>
                        <TableCell className="px-4 py-4 text-right sm:px-6">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/${user.userId}?period=${encodeURIComponent(dashboard.selectedPeriod)}`}>
                              Open
                              <ChevronRight className="size-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
