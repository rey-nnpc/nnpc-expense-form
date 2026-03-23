"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LogOut, ShieldCheck, Trash2, UserCheck, UserRoundCog, Users } from "lucide-react";
import AuthGate, { type AuthSession } from "@/components/auth-gate";
import { ThemeSettingsSheet } from "@/components/theme-settings-sheet";
import { TopRouteTabs } from "@/components/top-route-tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/supabase-api";
import {
  adminManageUserAccount,
  getAdminUserManagement,
  type AccountRole,
  type AdminUserManagementData,
  type AssignableRole,
  type UserAccount,
} from "@/lib/user-account-data";
import { cn } from "@/lib/utils";

type AdminMessage = {
  text: string;
  tone: "error" | "info";
};

type ManagementTab = "allowlist" | "management";
type PendingRoleReview = {
  nextRole: AssignableRole;
  user: UserAccount;
} | null;

function normalizeInitialTab(tab?: string): ManagementTab {
  return tab === "allowlist" ? "allowlist" : "management";
}

function formatShortDate(rawDate: string | null) {
  if (!rawDate) {
    return "Not set";
  }

  const parsedDate = new Date(rawDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return rawDate;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function roleLabel(role: AccountRole) {
  switch (role) {
    case "admin":
      return "Admin";
    case "central_admin":
      return "Central Admin";
    default:
      return "User";
  }
}

function roleAbilityCopy(role: AccountRole) {
  switch (role) {
    case "admin":
      return "Approves or disables standard user access";
    case "central_admin":
      return "Approves users, changes roles, and removes accounts";
    default:
      return "Uses the main expense system";
  }
}

function statusBadgeClassName(status: UserAccount["accessStatus"]) {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-300";
    case "disabled":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-300";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-300";
  }
}

function roleBadgeClassName(role: AccountRole) {
  switch (role) {
    case "admin":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/50 dark:text-sky-300";
    case "central_admin":
      return "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
    default:
      return "border-border bg-background text-foreground";
  }
}

function defaultAssignableRole(role: AccountRole): AssignableRole {
  return role === "admin" ? "admin" : "user";
}

function getRowStatusDate(account: UserAccount) {
  if (account.accessStatus === "disabled") {
    return account.disabledAt ?? account.updatedAt;
  }

  if (account.accessStatus === "approved") {
    return account.approvedAt ?? account.updatedAt;
  }

  return account.createdAt;
}

export default function AdminControlCenterView({
  initialTab,
}: {
  initialTab?: string;
}) {
  return (
    <AuthGate allowedRoles={["admin", "central_admin"]}>
      {({ account, logout, refreshAccount, session }) => (
        <ProtectedAdminControlCenter
          account={account}
          initialTab={normalizeInitialTab(initialTab)}
          logout={logout}
          refreshAccount={refreshAccount}
          session={session}
        />
      )}
    </AuthGate>
  );
}

function ProtectedAdminControlCenter({
  account,
  initialTab,
  logout,
  refreshAccount,
  session,
}: {
  account: UserAccount;
  initialTab: ManagementTab;
  logout: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  session: AuthSession;
}) {
  const [activeTab, setActiveTab] = useState<ManagementTab>(initialTab);
  const [data, setData] = useState<AdminUserManagementData | null>(null);
  const [message, setMessage] = useState<AdminMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestNonce, setRequestNonce] = useState(0);
  const [activeMutationKey, setActiveMutationKey] = useState<string | null>(null);
  const [approvalRoles, setApprovalRoles] = useState<Record<string, AssignableRole>>({});
  const [pendingRoleReview, setPendingRoleReview] = useState<PendingRoleReview>(null);

  const isCentralAdmin = account.role === "central_admin";

  useEffect(() => {
    let isActive = true;

    const loadData = async () => {
      const nextData = await getAdminUserManagement(session.accessToken);

      if (!isActive) {
        return;
      }

      setData(nextData);
      setApprovalRoles((currentRoles) => {
        const nextRoles = { ...currentRoles };

        for (const row of nextData.users) {
          if (row.role === "central_admin") {
            continue;
          }

          nextRoles[row.userId] =
            row.accessStatus === "pending"
              ? currentRoles[row.userId] ?? defaultAssignableRole(row.role)
              : defaultAssignableRole(row.role);
        }

        return nextRoles;
      });
    };

    void loadData()
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
          void logout();
          return;
        }

        if (
          error instanceof Error &&
          (error.message === "Approved access required." ||
            error.message === "Admin access required." ||
            error.message === "Central admin access required.")
        ) {
          void refreshAccount();
        }

        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "The user management workspace could not be loaded.",
        });
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [logout, refreshAccount, requestNonce, session.accessToken]);

  const users = data?.users ?? [];
  const managedUsers = users.filter((user) => user.accessStatus !== "pending");
  const allowlistUsers = users.filter((user) => user.accessStatus === "pending");

  const refreshManagementData = () => {
    setIsLoading(true);
    setRequestNonce((currentNonce) => currentNonce + 1);
  };

  const runAction = async ({
    action,
    confirmCopy,
    role,
    successCopy,
    target,
  }: {
    action: "approve" | "delete" | "disable" | "set_role";
    confirmCopy?: string;
    role?: AssignableRole;
    successCopy?: string;
    target: UserAccount;
  }) => {
    if (confirmCopy && !window.confirm(confirmCopy)) {
      return;
    }

    const mutationKey = `${action}:${target.userId}`;
    setActiveMutationKey(mutationKey);
    setMessage(null);

    try {
      await adminManageUserAccount({
        accessToken: session.accessToken,
        action,
        role,
        targetUserId: target.userId,
      });
      if (successCopy) {
        setMessage({
          tone: "info",
          text: successCopy,
        });
      }
      refreshManagementData();
    } catch (error: unknown) {
      if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
        void logout();
        return;
      }

      if (
        error instanceof Error &&
        (error.message === "Approved access required." ||
          error.message === "Admin access required." ||
          error.message === "Central admin access required.")
      ) {
        void refreshAccount();
      }

      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The requested account change could not be completed.",
      });
    } finally {
      setActiveMutationKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {account.role === "central_admin" ? "Central Admin" : "Admin"}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-[2.6rem]">
              User management
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              Review signups, control access, and manage who stays a standard user or an
              admin. Central-admin promotion still stays in the database on purpose.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">{session.userEmail}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
            <ThemeSettingsSheet userEmail={session.userEmail} />
            <Button type="button" variant="outline" onClick={() => void logout()}>
              <LogOut className="size-4" />
              Log out
            </Button>
          </div>
        </header>

        <TopRouteTabs accountRole={account.role} activeSection="user-management" />

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {isLoading && !data ? (
            <>
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
            </>
          ) : (
            <>
              <SummaryCard
                description="Waiting for access approval"
                icon={<Users className="size-4" />}
                label="Pending queue"
                value={data?.totals.pendingUsers ?? 0}
              />
              <SummaryCard
                description="Approved accounts that can use the app"
                icon={<UserCheck className="size-4" />}
                label="Approved users"
                value={data?.totals.approvedUsers ?? 0}
              />
              <SummaryCard
                description="Accounts currently blocked"
                icon={<UserRoundCog className="size-4" />}
                label="Disabled users"
                value={data?.totals.disabledUsers ?? 0}
              />
              <SummaryCard
                description="Approved admin or central-admin accounts"
                icon={<ShieldCheck className="size-4" />}
                label="Elevated roles"
                value={data?.totals.elevatedUsers ?? 0}
              />
            </>
          )}
        </section>

        <Card className="mt-6 border-border bg-card py-0 shadow-none">
          <CardContent className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div>
              <p className="text-sm font-medium text-foreground">
                {isCentralAdmin
                  ? "Central admins can approve users, change roles between user and admin, and remove accounts."
                  : "Admins can approve or disable standard user access. Role changes and removals stay with central admins."}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Pending approvals stay on Allowlist. Existing approved or disabled accounts stay on Management.
              </p>
            </div>
            <Badge className="rounded-full px-2.5 py-0.5" variant="outline">
              {roleLabel(account.role)}
            </Badge>
          </CardContent>
        </Card>

        {message ? (
          <Alert
            className="mt-5 border-border bg-card"
            variant={message.tone === "error" ? "destructive" : "default"}
          >
            <AlertTitle>
              {message.tone === "error" ? "User Management Unavailable" : "User Management"}
            </AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs className="mt-6" value={activeTab} onValueChange={(value) => setActiveTab(value as ManagementTab)}>
          <TabsList className="h-auto rounded-xl border border-border bg-muted/30 p-1">
            <TabsTrigger className="min-w-[9rem] rounded-lg px-4 py-2.5" value="management">
              Management
            </TabsTrigger>
            <TabsTrigger className="min-w-[9rem] rounded-lg px-4 py-2.5" value="allowlist">
              Allowlist
            </TabsTrigger>
          </TabsList>

          <TabsContent className="mt-4" value="management">
            <ManagementTableCard
              currentAccount={account}
              isCentralAdmin={isCentralAdmin}
              isLoading={isLoading}
              managedUsers={managedUsers}
              mutatingKey={activeMutationKey}
              pendingRoles={approvalRoles}
              setPendingRoleReview={setPendingRoleReview}
              runAction={runAction}
            />
          </TabsContent>

          <TabsContent className="mt-4" value="allowlist">
            <AllowlistTableCard
              allowlistUsers={allowlistUsers}
              isCentralAdmin={isCentralAdmin}
              isLoading={isLoading}
              mutatingKey={activeMutationKey}
              pendingRoles={approvalRoles}
              runAction={runAction}
              setPendingRole={(userId, role) =>
                setApprovalRoles((currentRoles) => ({
                  ...currentRoles,
                  [userId]: role,
                }))
              }
            />
          </TabsContent>
        </Tabs>

        <AlertDialog
          open={pendingRoleReview !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingRoleReview(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm role change</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingRoleReview
                  ? `${pendingRoleReview.user.displayName} will change from ${roleLabel(
                      pendingRoleReview.user.role,
                    )} to ${roleLabel(pendingRoleReview.nextRole)}.`
                  : "Review the selected role change before applying it."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
              The current role stays unchanged until you confirm this action.
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPendingRoleReview(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!pendingRoleReview) {
                    return;
                  }

                  const review = pendingRoleReview;
                  setPendingRoleReview(null);
                  void runAction({
                    action: "set_role",
                    role: review.nextRole,
                    successCopy: `${review.user.displayName} is now ${roleLabel(review.nextRole)}.`,
                    target: review.user,
                  });
                }}
              >
                Confirm role change
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function ManagementTableCard({
  currentAccount,
  isCentralAdmin,
  isLoading,
  managedUsers,
  mutatingKey,
  pendingRoles,
  setPendingRoleReview,
  runAction,
}: {
  currentAccount: UserAccount;
  isCentralAdmin: boolean;
  isLoading: boolean;
  managedUsers: UserAccount[];
  mutatingKey: string | null;
  pendingRoles: Record<string, AssignableRole>;
  setPendingRoleReview: (value: PendingRoleReview) => void;
  runAction: (input: {
    action: "approve" | "delete" | "disable" | "set_role";
    confirmCopy?: string;
    role?: AssignableRole;
    successCopy?: string;
    target: UserAccount;
  }) => Promise<void>;
}) {
  return (
    <ManagementSectionCard
      count={managedUsers.length}
      description="Approved and disabled accounts live here. Role changes are only available to central admins."
      title="Management"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/35">
              <TableHead className="min-w-[13rem] px-4 py-3">User</TableHead>
              <TableHead className="min-w-[14rem] px-4 py-3">Email</TableHead>
              <TableHead className="min-w-[10rem] px-4 py-3">Role</TableHead>
              <TableHead className="min-w-[16rem] px-4 py-3">Abilities</TableHead>
              <TableHead className="min-w-[9rem] px-4 py-3">Status</TableHead>
              <TableHead className="min-w-[8rem] px-4 py-3">Updated</TableHead>
              <TableHead className="min-w-[12rem] px-4 py-3 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <LoadingTableRows colCount={7} />
            ) : managedUsers.length === 0 ? (
              <EmptyTableRow colSpan={7} message="No approved or disabled accounts are available." />
            ) : (
              managedUsers.map((user) => {
                const isCurrentUser = user.userId === currentAccount.userId;
                const currentAssignableRole = defaultAssignableRole(user.role);
                const canEditRole =
                  isCentralAdmin && user.role !== "central_admin" && user.accessStatus !== "pending";
                const canRemove = isCentralAdmin && user.role !== "central_admin" && !isCurrentUser;
                const canApprove =
                  user.accessStatus === "disabled" &&
                  (isCentralAdmin || user.role === "user");
                const canDisable =
                  user.accessStatus === "approved" &&
                  !isCurrentUser &&
                  (isCentralAdmin ? user.role !== "central_admin" : user.role === "user");
                const rowLocked = isCurrentUser || user.role === "central_admin";
                const rowMutationKey =
                  mutatingKey?.split(":")[1] === user.userId ? mutatingKey : null;
                const selectedRole = pendingRoles[user.userId] ?? currentAssignableRole;

                return (
                  <TableRow key={user.userId}>
                    <TableCell className="px-4 py-4 align-middle">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{user.displayName}</span>
                        {isCurrentUser ? (
                          <Badge className="rounded-full px-2.5 py-0.5" variant="outline">
                            You
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      {canEditRole ? (
                        <RoleSelect
                          disabled={rowMutationKey !== null}
                          value={currentAssignableRole}
                          onValueChange={(nextRole) => {
                            if (nextRole === currentAssignableRole) {
                              return;
                            }

                            setPendingRoleReview({
                              nextRole,
                              user,
                            });
                          }}
                        />
                      ) : (
                        <RoleBadge role={user.role} />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      <p className="text-sm leading-6 text-foreground">{roleAbilityCopy(user.role)}</p>
                      {canEditRole ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Select a different role to review and confirm the change.
                        </p>
                      ) : null}
                      {rowLocked && user.role === "central_admin" ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Central-admin state stays in SQL.
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      <StatusBadge status={user.accessStatus} />
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                      {formatShortDate(getRowStatusDate(user))}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      <RowActions align="end">
                        {canApprove ? (
                          <Button
                            disabled={rowMutationKey !== null}
                            size="sm"
                            type="button"
                            onClick={() =>
                              void runAction({
                                action: "approve",
                                role: selectedRole,
                                target: user,
                              })
                            }
                          >
                            Approve
                          </Button>
                        ) : null}
                        {canDisable ? (
                          <Button
                            disabled={rowMutationKey !== null}
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() =>
                              void runAction({
                                action: "disable",
                                target: user,
                              })
                            }
                          >
                            Disable
                          </Button>
                        ) : null}
                        {canRemove ? (
                          <RemoveActionButton
                            disabled={rowMutationKey !== null}
                            title={`Remove ${user.displayName}`}
                            onClick={() =>
                              void runAction({
                                action: "delete",
                                confirmCopy: `Remove ${user.displayName} from the system? This also deletes their auth account and related data.`,
                                target: user,
                              })
                            }
                          />
                        ) : null}
                      </RowActions>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </ManagementSectionCard>
  );
}

function AllowlistTableCard({
  allowlistUsers,
  isCentralAdmin,
  isLoading,
  mutatingKey,
  pendingRoles,
  runAction,
  setPendingRole,
}: {
  allowlistUsers: UserAccount[];
  isCentralAdmin: boolean;
  isLoading: boolean;
  mutatingKey: string | null;
  pendingRoles: Record<string, AssignableRole>;
  runAction: (input: {
    action: "approve" | "delete" | "disable" | "set_role";
    confirmCopy?: string;
    role?: AssignableRole;
    successCopy?: string;
    target: UserAccount;
  }) => Promise<void>;
  setPendingRole: (userId: string, role: AssignableRole) => void;
}) {
  return (
    <ManagementSectionCard
      count={allowlistUsers.length}
      description="New signups land here first. Admins can approve or disapprove standard access, while central admins can also approve as admin and remove accounts."
      title="Allowlist"
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/35">
              <TableHead className="min-w-[13rem] px-4 py-3">User</TableHead>
              <TableHead className="min-w-[14rem] px-4 py-3">Email</TableHead>
              <TableHead className="min-w-[8rem] px-4 py-3">Signed up</TableHead>
              <TableHead className="min-w-[10rem] px-4 py-3">Approve as</TableHead>
              <TableHead className="min-w-[14rem] px-4 py-3 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <LoadingTableRows colCount={5} />
            ) : allowlistUsers.length === 0 ? (
              <EmptyTableRow colSpan={5} message="No pending signups are waiting for review." />
            ) : (
              allowlistUsers.map((user) => {
                const rowMutationKey =
                  mutatingKey?.split(":")[1] === user.userId ? mutatingKey : null;

                return (
                  <TableRow key={user.userId}>
                    <TableCell className="px-4 py-4 align-middle">
                      <div className="font-medium">{user.displayName}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {roleAbilityCopy(user.role)}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                      {formatShortDate(user.createdAt)}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      {isCentralAdmin ? (
                        <RoleSelect
                          disabled={rowMutationKey !== null}
                          value={pendingRoles[user.userId] ?? defaultAssignableRole(user.role)}
                          onValueChange={(nextRole) => setPendingRole(user.userId, nextRole)}
                        />
                      ) : (
                        <RoleBadge role="user" />
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      <RowActions align="end">
                        <Button
                          disabled={rowMutationKey !== null}
                          size="sm"
                          type="button"
                          onClick={() =>
                            void runAction({
                              action: "approve",
                              role: isCentralAdmin
                                ? pendingRoles[user.userId] ?? defaultAssignableRole(user.role)
                                : "user",
                              target: user,
                            })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          disabled={rowMutationKey !== null}
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() =>
                            void runAction({
                              action: "disable",
                              target: user,
                            })
                          }
                        >
                          Disapprove
                        </Button>
                        {isCentralAdmin ? (
                          <RemoveActionButton
                            disabled={rowMutationKey !== null}
                            title={`Remove ${user.displayName}`}
                            onClick={() =>
                              void runAction({
                                action: "delete",
                                confirmCopy: `Remove ${user.displayName} from the system? This also deletes their auth account and related data.`,
                                target: user,
                              })
                            }
                          />
                        ) : null}
                      </RowActions>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </ManagementSectionCard>
  );
}

function SummaryCard({
  description,
  icon,
  label,
  value,
}: {
  description: string;
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card className="border-border bg-card py-0 shadow-none">
      <CardContent className="flex min-h-[8.25rem] flex-col justify-between px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </div>
          <div className="rounded-full border border-border bg-muted/25 p-2 text-muted-foreground">
            {icon}
          </div>
        </div>
        <div>
          <div className="text-3xl font-semibold tracking-tight">{value}</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCardSkeleton() {
  return (
    <Card className="border-border bg-card py-0 shadow-none">
      <CardContent className="flex min-h-[8.25rem] flex-col justify-between px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="size-8 rounded-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-4 w-full max-w-[12rem]" />
        </div>
      </CardContent>
    </Card>
  );
}

function ManagementSectionCard({
  children,
  count,
  description,
  title,
}: {
  children: ReactNode;
  count: number;
  description: string;
  title: string;
}) {
  return (
    <Card className="border-border bg-background py-0 shadow-none">
      <CardHeader className="border-b border-border px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
            <CardDescription className="mt-1 text-sm leading-7">{description}</CardDescription>
          </div>
          <Badge className="rounded-full px-2.5 py-0.5" variant="outline">
            {count} row{count === 1 ? "" : "s"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0 py-0">{children}</CardContent>
    </Card>
  );
}

function EmptyTableRow({
  colSpan,
  message,
}: {
  colSpan: number;
  message: string;
}) {
  return (
    <TableRow>
      <TableCell className="px-4 py-8 text-sm text-muted-foreground" colSpan={colSpan}>
        {message}
      </TableCell>
    </TableRow>
  );
}

function LoadingTableRows({
  colCount,
  rowCount = 4,
}: {
  colCount: number;
  rowCount?: number;
}) {
  return Array.from({ length: rowCount }).map((_, rowIndex) => (
    <TableRow key={`loading-row-${rowIndex + 1}`}>
      {Array.from({ length: colCount }).map((__, columnIndex) => (
        <TableCell className="px-4 py-4" key={`loading-cell-${rowIndex + 1}-${columnIndex + 1}`}>
          <Skeleton className="h-9 w-full" />
        </TableCell>
      ))}
    </TableRow>
  ));
}

function RowActions({
  align = "start",
  children,
}: {
  align?: "end" | "start";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        align === "end" ? "justify-end" : "justify-start",
      )}
    >
      {children}
    </div>
  );
}

function RemoveActionButton({
  disabled = false,
  onClick,
  title,
}: {
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <Button
      aria-label={title}
      disabled={disabled}
      size="icon-sm"
      title={title}
      type="button"
      variant="destructive"
      onClick={onClick}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

function RoleSelect({
  disabled = false,
  onValueChange,
  value,
}: {
  disabled?: boolean;
  onValueChange: (value: AssignableRole) => void;
  value: AssignableRole;
}) {
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as AssignableRole)}
    >
      <SelectTrigger className="min-w-[8rem] bg-background">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value="user">User</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

function RoleBadge({ role }: { role: AccountRole }) {
  return (
    <Badge className={cn("rounded-full px-2.5 py-0.5", roleBadgeClassName(role))} variant="outline">
      {roleLabel(role)}
    </Badge>
  );
}

function StatusBadge({ status }: { status: UserAccount["accessStatus"] }) {
  return (
    <Badge
      className={cn("rounded-full px-2.5 py-0.5 capitalize", statusBadgeClassName(status))}
      variant="outline"
    >
      {status}
    </Badge>
  );
}
