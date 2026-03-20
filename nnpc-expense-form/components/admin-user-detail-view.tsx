"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, LogOut } from "lucide-react";
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
  type AdminExpenseUserSummary,
} from "@/lib/admin-data";
import { formatDisplayDate } from "@/lib/date";
import { formatCurrency } from "@/lib/expense-data";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/supabase-api";

type AdminMessage = {
  tone: "error" | "info";
  text: string;
};

export default function AdminUserDetailView({
  initialPeriod,
  userId,
}: {
  initialPeriod: string;
  userId: string;
}) {
  return (
    <AuthGate>
      {({ session, logout }) => (
        <ProtectedAdminUserDetail
          initialPeriod={initialPeriod}
          logout={logout}
          session={session}
          userId={userId}
        />
      )}
    </AuthGate>
  );
}

function ProtectedAdminUserDetail({
  initialPeriod,
  logout,
  session,
  userId,
}: {
  initialPeriod: string;
  logout: () => Promise<void>;
  session: AuthSession;
  userId: string;
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
              : "The admin expense detail could not be loaded.",
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

  const selectedUser =
    dashboard?.users.find((dashboardUser) => dashboardUser.userId === userId) ?? null;

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

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Admin Expenses
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{session.userEmail}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
            <ThemeSettingsSheet userEmail={session.userEmail} />
            <Button type="button" variant="outline" onClick={() => void logout()}>
              <LogOut className="size-4" />
              Log out
            </Button>
          </div>
        </header>

        <TopRouteTabs activeSection="admin" />

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <Button asChild variant="outline">
            <Link href={`/admin?period=${encodeURIComponent(activePeriod)}`}>
              <ArrowLeft className="size-4" />
              Back To List
            </Link>
          </Button>

          <form
            className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end"
            onSubmit={handlePeriodSubmit}
          >
            <label className="flex w-full flex-col gap-1.5 text-sm sm:w-[13rem]">
              <span className="text-muted-foreground">Month</span>
              <Input
                className="h-10 bg-background"
                type="month"
                value={draftPeriod}
                onChange={(event) => setDraftPeriod(event.target.value)}
              />
            </label>
            <Button className="sm:min-w-[7rem]" type="submit">
              Update
            </Button>
          </form>
        </div>

        {message ? (
          <Alert
            className="mt-5 border-border bg-card"
            variant={message.tone === "error" ? "destructive" : "default"}
          >
            <AlertTitle>
              {message.tone === "error" ? "Admin Detail Unavailable" : "Admin Detail"}
            </AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="mt-5 border-border bg-card py-0 shadow-none">
          <CardHeader className="gap-4 border-b border-border px-5 py-6 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="font-serif text-2xl tracking-tight">
                  {selectedUser ? selectedUser.displayName : "User Detail"}
                </CardTitle>
                <CardDescription className="mt-1 text-sm leading-6">
                  {selectedUser
                    ? `${selectedUser.email} · ${selectedUser.monthDaysWithExpenses} expense day(s) in ${dashboard?.periodLabel ?? activePeriod}`
                    : "The selected user could not be found for this admin view."}
                </CardDescription>
              </div>

              {selectedUser ? (
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Badge className="rounded-full px-2.5 py-0.5" variant="outline">
                    {dashboard?.periodLabel ?? activePeriod}:{" "}
                    {formatCurrency(selectedUser.monthlyExpense)}
                  </Badge>
                  <Badge className="rounded-full px-2.5 py-0.5" variant="outline">
                    {dashboard?.selectedYear ?? Number(activePeriod.slice(0, 4))}:{" "}
                    {formatCurrency(selectedUser.yearlyExpense)}
                  </Badge>
                </div>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="px-0 py-0">
            {isLoadingDashboard ? (
              <div className="px-5 py-10 text-sm text-muted-foreground sm:px-6">
                Loading user expense detail...
              </div>
            ) : !dashboard ? (
              <div className="px-5 py-10 text-sm text-muted-foreground sm:px-6">
                No admin detail data available.
              </div>
            ) : !selectedUser ? (
              <div className="px-5 py-10 text-sm text-muted-foreground sm:px-6">
                No matching user was found.
              </div>
            ) : (
              <UserDetailContent
                periodLabel={dashboard.periodLabel}
                selectedUser={selectedUser}
                selectedYear={dashboard.selectedYear}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UserDetailContent({
  periodLabel,
  selectedUser,
  selectedYear,
}: {
  periodLabel: string;
  selectedUser: AdminExpenseUserSummary;
  selectedYear: number;
}) {
  return (
    <div className="space-y-0">
      <div className="grid gap-4 border-b border-border px-5 py-6 sm:grid-cols-3 sm:px-6">
        <div className="flex min-h-[8.75rem] flex-col justify-between rounded-lg border border-border bg-card px-4 py-4">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Month Total
          </div>
          <div className="mt-2 font-serif text-3xl">
            {formatCurrency(selectedUser.monthlyExpense)}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{periodLabel}</p>
        </div>

        <div className="flex min-h-[8.75rem] flex-col justify-between rounded-lg border border-border bg-card px-4 py-4">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Year Total
          </div>
          <div className="mt-2 font-serif text-3xl">
            {formatCurrency(selectedUser.yearlyExpense)}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{selectedYear}</p>
        </div>

        <div className="flex min-h-[8.75rem] flex-col justify-between rounded-lg border border-border bg-card px-4 py-4">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Expense Days
          </div>
          <div className="mt-2 font-serif text-3xl">{selectedUser.monthDaysWithExpenses}</div>
          <p className="mt-1 text-sm text-muted-foreground">Submitted days in this month</p>
        </div>
      </div>

      {selectedUser.detailRows.length === 0 ? (
        <div className="px-5 py-10 text-sm text-muted-foreground sm:px-6">
          No submitted expense days for {periodLabel}.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[14rem] px-4 py-3 sm:px-6">Date</TableHead>
              <TableHead className="w-[12rem] px-4 py-3">Expense Code</TableHead>
              <TableHead className="w-[14rem] px-4 py-3">Employee</TableHead>
              <TableHead className="w-[16rem] px-4 py-3">Company</TableHead>
              <TableHead className="w-[10rem] px-4 py-3 text-right sm:px-6">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedUser.detailRows.map((detail) => (
              <TableRow key={detail.reportId}>
                <TableCell className="px-4 py-4 align-middle sm:px-6">
                  {formatDisplayDate(detail.date)}
                </TableCell>
                <TableCell className="px-4 py-4 align-middle">{detail.expenseCode}</TableCell>
                <TableCell className="px-4 py-4 align-middle">{detail.employeeName}</TableCell>
                <TableCell className="px-4 py-4 align-middle">{detail.companyName}</TableCell>
                <TableCell className="px-4 py-4 align-middle text-right font-medium tabular-nums sm:px-6">
                  {formatCurrency(detail.totalAmount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
