"use client";

import { useState, type ReactNode } from "react";
import { LogOut, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import AuthGate, { type AuthSession } from "@/components/auth-gate";
import { ThemeSettingsSheet } from "@/components/theme-settings-sheet";
import { TopRouteTabs } from "@/components/top-route-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type AccessStatus = "approved" | "disabled" | "pending";
type Role = "admin" | "user";
type AdminPrototypeSection = "admin-management" | "user-management";

type PrototypeAccount = {
  accessStatus: AccessStatus;
  approvedAt: string | null;
  createdAt: string;
  disabledAt: string | null;
  displayName: string;
  email: string;
  role: Role;
  team: string;
  userId: string;
};

const INITIAL_ACCOUNTS: PrototypeAccount[] = [
  {
    accessStatus: "approved",
    approvedAt: "2026-03-02",
    createdAt: "2026-02-28",
    disabledAt: null,
    displayName: "Amina Patel",
    email: "amina@nnpc.local",
    role: "admin",
    team: "Finance Ops",
    userId: "admin-amina",
  },
  {
    accessStatus: "approved",
    approvedAt: "2026-03-03",
    createdAt: "2026-03-01",
    disabledAt: null,
    displayName: "Noah Kim",
    email: "noah@nnpc.local",
    role: "admin",
    team: "Operations",
    userId: "admin-noah",
  },
  {
    accessStatus: "approved",
    approvedAt: "2026-03-06",
    createdAt: "2026-03-05",
    disabledAt: null,
    displayName: "Jules Carter",
    email: "jules@nnpc.local",
    role: "user",
    team: "Field Team",
    userId: "user-jules",
  },
  {
    accessStatus: "approved",
    approvedAt: "2026-03-08",
    createdAt: "2026-03-07",
    disabledAt: null,
    displayName: "Mina Chao",
    email: "mina@nnpc.local",
    role: "user",
    team: "Procurement",
    userId: "user-mina",
  },
  {
    accessStatus: "pending",
    approvedAt: null,
    createdAt: "2026-03-19",
    disabledAt: null,
    displayName: "Daniel Moore",
    email: "daniel@nnpc.local",
    role: "user",
    team: "Logistics",
    userId: "pending-daniel",
  },
  {
    accessStatus: "pending",
    approvedAt: null,
    createdAt: "2026-03-18",
    disabledAt: null,
    displayName: "Sora Bell",
    email: "sora@nnpc.local",
    role: "user",
    team: "Admin Support",
    userId: "pending-sora",
  },
  {
    accessStatus: "disabled",
    approvedAt: "2026-03-04",
    createdAt: "2026-03-02",
    disabledAt: "2026-03-16",
    displayName: "Ivy Nguyen",
    email: "ivy@nnpc.local",
    role: "user",
    team: "Finance Ops",
    userId: "disabled-ivy",
  },
  {
    accessStatus: "disabled",
    approvedAt: "2026-03-05",
    createdAt: "2026-03-03",
    disabledAt: "2026-03-17",
    displayName: "Marco Ellis",
    email: "marco@nnpc.local",
    role: "admin",
    team: "Regional Ops",
    userId: "disabled-marco",
  },
];

function formatShortDate(rawDate: string | null) {
  if (!rawDate) {
    return "Not set";
  }

  const parsedDate = new Date(`${rawDate}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return rawDate;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function getTodayDateStamp() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "03";
  const day = parts.find((part) => part.type === "day")?.value ?? "20";

  return `${year}-${month}-${day}`;
}

function statusBadgeClassName(status: AccessStatus) {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-300";
    case "disabled":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-300";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-300";
  }
}

function roleBadgeClassName(role: Role) {
  return role === "admin"
    ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/50 dark:text-sky-300"
    : "border-border bg-background text-foreground";
}

function sortByName(accounts: PrototypeAccount[]) {
  return [...accounts].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function sortByNewest(
  accounts: PrototypeAccount[],
  accessor: (account: PrototypeAccount) => string | null,
) {
  return [...accounts].sort((left, right) => {
    const leftValue = accessor(left) ?? "";
    const rightValue = accessor(right) ?? "";

    return rightValue.localeCompare(leftValue);
  });
}

function getApprovedAdminCount(accounts: PrototypeAccount[]) {
  return accounts.filter(
    (account) => account.accessStatus === "approved" && account.role === "admin",
  ).length;
}

export default function AdminControlCenterView({
  section,
}: {
  section: AdminPrototypeSection;
}) {
  return (
    <AuthGate>
      {({ session, logout }) => (
        <ProtectedAdminControlCenter logout={logout} section={section} session={session} />
      )}
    </AuthGate>
  );
}

function ProtectedAdminControlCenter({
  logout,
  section,
  session,
}: {
  logout: () => Promise<void>;
  section: AdminPrototypeSection;
  session: AuthSession;
}) {
  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
  const [approvalRoles, setApprovalRoles] = useState<Record<string, Role>>(() =>
    Object.fromEntries(INITIAL_ACCOUNTS.map((account) => [account.userId, account.role])),
  );

  const pendingAccounts = sortByNewest(
    accounts.filter((account) => account.accessStatus === "pending"),
    (account) => account.createdAt,
  );
  const approvedAccounts = sortByName(
    accounts.filter((account) => account.accessStatus === "approved"),
  );
  const disabledAccounts = sortByNewest(
    accounts.filter((account) => account.accessStatus === "disabled"),
    (account) => account.disabledAt ?? account.createdAt,
  );
  const approvedAdmins = sortByName(
    approvedAccounts.filter((account) => account.role === "admin"),
  );
  const approvedMembers = sortByName(
    approvedAccounts.filter((account) => account.role === "user"),
  );

  const isCurrentOperator = (account: PrototypeAccount) =>
    account.email.toLowerCase() === session.userEmail.toLowerCase();

  const isProtectedAdmin = (
    account: PrototypeAccount,
    sourceAccounts: PrototypeAccount[] = accounts,
  ) =>
    account.accessStatus === "approved" &&
    account.role === "admin" &&
    (getApprovedAdminCount(sourceAccounts) === 1 || isCurrentOperator(account));

  const updateApprovalRole = (userId: string, role: Role) => {
    setApprovalRoles((currentRoles) => ({
      ...currentRoles,
      [userId]: role,
    }));
  };

  const handleApprove = (userId: string) => {
    const nextRole = approvalRoles[userId] ?? "user";

    setAccounts((currentAccounts) =>
      currentAccounts.map((account) =>
        account.userId === userId
          ? {
              ...account,
              accessStatus: "approved",
              approvedAt: getTodayDateStamp(),
              disabledAt: null,
              role: nextRole,
            }
          : account,
      ),
    );
  };

  const handleDisapprove = (userId: string) => {
    setAccounts((currentAccounts) =>
      currentAccounts.map((account) =>
        account.userId === userId && !isProtectedAdmin(account, currentAccounts)
          ? {
              ...account,
              accessStatus: "disabled",
              disabledAt: getTodayDateStamp(),
            }
          : account,
      ),
    );
  };

  const handleRoleChange = (userId: string, nextRole: Role) => {
    setAccounts((currentAccounts) =>
      currentAccounts.map((account) => {
        if (account.userId !== userId) {
          return account;
        }

        if (account.accessStatus !== "approved") {
          return account;
        }

        if (
          account.role === "admin" &&
          nextRole === "user" &&
          isProtectedAdmin(account, currentAccounts)
        ) {
          return account;
        }

        return {
          ...account,
          role: nextRole,
        };
      }),
    );
  };

  const handleRemove = (userId: string) => {
    const targetAccount = accounts.find((account) => account.userId === userId);

    if (!targetAccount) {
      return;
    }

    if (isProtectedAdmin(targetAccount)) {
      return;
    }

    if (!window.confirm(`Remove ${targetAccount.displayName} from this prototype list?`)) {
      return;
    }

    setAccounts((currentAccounts) =>
      currentAccounts.filter((account) => account.userId !== userId),
    );
    setApprovalRoles((currentRoles) => {
      const nextRoles = { ...currentRoles };

      delete nextRoles[userId];

      return nextRoles;
    });
  };

  const pageCopy =
    section === "user-management"
      ? {
          description:
            "Review signups, approve access, disapprove accounts, and remove users from the system. Prototype only, no live mutations yet.",
          navKey: "user-management" as const,
          title: "User management",
        }
      : {
          description:
            "Adjust admin privileges, demote admins, and remove approved accounts from the system. Prototype only, no live mutations yet.",
          navKey: "admin-management" as const,
          title: "Admin management",
        };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Central Admin
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-[2.6rem]">
              {pageCopy.title}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              {pageCopy.description}
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

        <TopRouteTabs activeSection={pageCopy.navKey} />

        <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            description="Waiting for central admin review"
            icon={<Users className="size-4" />}
            label="Pending queue"
            value={pendingAccounts.length}
          />
          <SummaryCard
            description="Allowed into the main system"
            icon={<ShieldCheck className="size-4" />}
            label="Approved users"
            value={approvedAccounts.length}
          />
          <SummaryCard
            description="Blocked or disapproved accounts"
            icon={<UserCog className="size-4" />}
            label="Disabled users"
            value={disabledAccounts.length}
          />
          <SummaryCard
            description="Approved admins with full access"
            icon={<ShieldCheck className="size-4" />}
            label="Active admins"
            value={approvedAdmins.length}
          />
        </section>

        <div className="mt-6 space-y-4">
          {section === "user-management" ? (
            <UserManagementContent
              accounts={{
                approvedAccounts,
                disabledAccounts,
                pendingAccounts,
              }}
              approvalRoles={approvalRoles}
              formatShortDate={formatShortDate}
              handleApprove={handleApprove}
              handleDisapprove={handleDisapprove}
              handleRemove={handleRemove}
              isCurrentOperator={isCurrentOperator}
              isProtectedAdmin={isProtectedAdmin}
              updateApprovalRole={updateApprovalRole}
            />
          ) : (
            <AdminManagementContent
              approvedAdmins={approvedAdmins}
              approvedMembers={approvedMembers}
              handleRemove={handleRemove}
              handleRoleChange={handleRoleChange}
              isCurrentOperator={isCurrentOperator}
              isProtectedAdmin={isProtectedAdmin}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function UserManagementContent({
  accounts,
  approvalRoles,
  formatShortDate,
  handleApprove,
  handleDisapprove,
  handleRemove,
  isCurrentOperator,
  isProtectedAdmin,
  updateApprovalRole,
}: {
  accounts: {
    approvedAccounts: PrototypeAccount[];
    disabledAccounts: PrototypeAccount[];
    pendingAccounts: PrototypeAccount[];
  };
  approvalRoles: Record<string, Role>;
  formatShortDate: (value: string | null) => string;
  handleApprove: (userId: string) => void;
  handleDisapprove: (userId: string) => void;
  handleRemove: (userId: string) => void;
  isCurrentOperator: (account: PrototypeAccount) => boolean;
  isProtectedAdmin: (account: PrototypeAccount) => boolean;
  updateApprovalRole: (userId: string, role: Role) => void;
}) {
  const { approvedAccounts, disabledAccounts, pendingAccounts } = accounts;

  return (
    <div className="space-y-5">
      <ManagementSectionCard
        count={pendingAccounts.length}
        description="Approve, disapprove, or remove new signups. Role is selected at approval time."
        title="Pending approvals"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[12rem] px-4 py-3">User</TableHead>
                <TableHead className="min-w-[13rem] px-4 py-3">Email</TableHead>
                <TableHead className="min-w-[9rem] px-4 py-3">Team</TableHead>
                <TableHead className="min-w-[8rem] px-4 py-3">Requested</TableHead>
                <TableHead className="min-w-[9rem] px-4 py-3">Approve As</TableHead>
                <TableHead className="min-w-[11rem] px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingAccounts.length === 0 ? (
                <EmptyTableRow colSpan={6} message="No pending signups in this prototype queue." />
              ) : (
                pendingAccounts.map((account) => (
                  <TableRow key={account.userId}>
                    <TableCell className="px-4 py-4 align-middle">
                      <div className="font-medium">{account.displayName}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {account.accessStatus}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                      {account.email}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">{account.team}</TableCell>
                    <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                      {formatShortDate(account.createdAt)}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      <RoleSelect
                        onValueChange={(nextRole) => updateApprovalRole(account.userId, nextRole)}
                        value={approvalRoles[account.userId] ?? account.role}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      <RowActions align="end">
                        <Button size="sm" type="button" onClick={() => handleApprove(account.userId)}>
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => handleDisapprove(account.userId)}
                        >
                          Reject
                        </Button>
                        <RemoveActionButton
                          onClick={() => handleRemove(account.userId)}
                          title={`Remove ${account.displayName}`}
                        />
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ManagementSectionCard>

      <ManagementSectionCard
        count={approvedAccounts.length}
        description="Approved users can use the system. This page only handles access state, not role editing."
        title="Approved access"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[12rem] px-4 py-3">User</TableHead>
                <TableHead className="min-w-[13rem] px-4 py-3">Email</TableHead>
                <TableHead className="min-w-[9rem] px-4 py-3">Team</TableHead>
                <TableHead className="min-w-[8rem] px-4 py-3">Role</TableHead>
                <TableHead className="min-w-[8rem] px-4 py-3">Approved</TableHead>
                <TableHead className="min-w-[10rem] px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedAccounts.length === 0 ? (
                <EmptyTableRow colSpan={6} message="No approved users in this prototype state." />
              ) : (
                approvedAccounts.map((account) => {
                  const rowLocked = isProtectedAdmin(account);

                  return (
                    <TableRow key={account.userId}>
                      <TableCell className="px-4 py-4 align-middle">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{account.displayName}</span>
                          {isCurrentOperator(account) ? (
                            <Badge className="rounded-full px-2.5 py-0.5" variant="outline">
                              You
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                        {account.email}
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle">{account.team}</TableCell>
                      <TableCell className="px-4 py-4 align-middle">
                        <RoleBadge role={account.role} />
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                        {formatShortDate(account.approvedAt)}
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle">
                        <RowActions align="end">
                          <Button
                            disabled={rowLocked}
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => handleDisapprove(account.userId)}
                          >
                            Disable
                          </Button>
                          <RemoveActionButton
                            disabled={rowLocked}
                            onClick={() => handleRemove(account.userId)}
                            title={`Remove ${account.displayName}`}
                          />
                        </RowActions>
                        {rowLocked ? (
                          <p className="mt-2 text-right text-xs text-muted-foreground">
                            Keep one approved admin and protect the current operator.
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </ManagementSectionCard>

      <ManagementSectionCard
        count={disabledAccounts.length}
        description="Re-approve disabled accounts with a chosen role, or remove them from the system."
        title="Disabled users"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[12rem] px-4 py-3">User</TableHead>
                <TableHead className="min-w-[13rem] px-4 py-3">Email</TableHead>
                <TableHead className="min-w-[9rem] px-4 py-3">Team</TableHead>
                <TableHead className="min-w-[8rem] px-4 py-3">Disabled</TableHead>
                <TableHead className="min-w-[9rem] px-4 py-3">Approve As</TableHead>
                <TableHead className="min-w-[10rem] px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {disabledAccounts.length === 0 ? (
                <EmptyTableRow colSpan={6} message="No disabled users in this prototype state." />
              ) : (
                disabledAccounts.map((account) => (
                  <TableRow key={account.userId}>
                    <TableCell className="px-4 py-4 align-middle">
                      <div className="font-medium">{account.displayName}</div>
                      <div className="mt-1">
                        <RoleBadge role={account.role} />
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                      {account.email}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">{account.team}</TableCell>
                    <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                      {formatShortDate(account.disabledAt)}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      <RoleSelect
                        onValueChange={(nextRole) => updateApprovalRole(account.userId, nextRole)}
                        value={approvalRoles[account.userId] ?? account.role}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      <RowActions align="end">
                        <Button size="sm" type="button" onClick={() => handleApprove(account.userId)}>
                          Approve
                        </Button>
                        <RemoveActionButton
                          onClick={() => handleRemove(account.userId)}
                          title={`Remove ${account.displayName}`}
                        />
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ManagementSectionCard>
    </div>
  );
}

function AdminManagementContent({
  approvedAdmins,
  approvedMembers,
  handleRemove,
  handleRoleChange,
  isCurrentOperator,
  isProtectedAdmin,
}: {
  approvedAdmins: PrototypeAccount[];
  approvedMembers: PrototypeAccount[];
  handleRemove: (userId: string) => void;
  handleRoleChange: (userId: string, role: Role) => void;
  isCurrentOperator: (account: PrototypeAccount) => boolean;
  isProtectedAdmin: (account: PrototypeAccount) => boolean;
}) {
  return (
    <div className="space-y-5">
      <ManagementSectionCard
        count={approvedAdmins.length}
        description="Current admins can be demoted back to user or removed, with the last approved admin protected."
        title="Admin roster"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[12rem] px-4 py-3">Admin</TableHead>
                <TableHead className="min-w-[13rem] px-4 py-3">Email</TableHead>
                <TableHead className="min-w-[9rem] px-4 py-3">Team</TableHead>
                <TableHead className="min-w-[8rem] px-4 py-3">Status</TableHead>
                <TableHead className="min-w-[9rem] px-4 py-3">Role</TableHead>
                <TableHead className="min-w-[5rem] px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedAdmins.length === 0 ? (
                <EmptyTableRow colSpan={6} message="No approved admins are available." />
              ) : (
                approvedAdmins.map((account) => {
                  const rowLocked = isProtectedAdmin(account);

                  return (
                    <TableRow key={account.userId}>
                      <TableCell className="px-4 py-4 align-middle">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{account.displayName}</span>
                          {isCurrentOperator(account) ? (
                            <Badge className="rounded-full px-2.5 py-0.5" variant="outline">
                              You
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                        {account.email}
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle">{account.team}</TableCell>
                      <TableCell className="px-4 py-4 align-middle">
                        <StatusBadge status={account.accessStatus} />
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle">
                        <RoleSelect
                          disabled={rowLocked}
                          onValueChange={(nextRole) => handleRoleChange(account.userId, nextRole)}
                          value={account.role}
                        />
                      </TableCell>
                      <TableCell className="px-4 py-4 align-middle">
                        <RowActions align="end">
                          <RemoveActionButton
                            disabled={rowLocked}
                            onClick={() => handleRemove(account.userId)}
                            title={`Remove ${account.displayName}`}
                          />
                        </RowActions>
                        {rowLocked ? (
                          <p className="mt-2 text-right text-xs text-muted-foreground">
                            This row is locked to avoid removing the current or last approved admin.
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </ManagementSectionCard>

      <ManagementSectionCard
        count={approvedMembers.length}
        description="Promote approved users to admin or keep them as standard users."
        title="Approved member roles"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[12rem] px-4 py-3">User</TableHead>
                <TableHead className="min-w-[13rem] px-4 py-3">Email</TableHead>
                <TableHead className="min-w-[9rem] px-4 py-3">Team</TableHead>
                <TableHead className="min-w-[8rem] px-4 py-3">Status</TableHead>
                <TableHead className="min-w-[9rem] px-4 py-3">Role</TableHead>
                <TableHead className="min-w-[5rem] px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedMembers.length === 0 ? (
                <EmptyTableRow colSpan={6} message="No approved non-admin users are available." />
              ) : (
                approvedMembers.map((account) => (
                  <TableRow key={account.userId}>
                    <TableCell className="px-4 py-4 align-middle font-medium">
                      {account.displayName}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle text-muted-foreground">
                      {account.email}
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">{account.team}</TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      <StatusBadge status={account.accessStatus} />
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      <RoleSelect
                        onValueChange={(nextRole) => handleRoleChange(account.userId, nextRole)}
                        value={account.role}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-4 align-middle">
                      <RowActions align="end">
                        <RemoveActionButton
                          onClick={() => handleRemove(account.userId)}
                          title={`Remove ${account.displayName}`}
                        />
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ManagementSectionCard>
    </div>
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
  onValueChange: (value: Role) => void;
  value: Role;
}) {
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as Role)}
    >
      <SelectTrigger className="min-w-[7.75rem] bg-background">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value="user">User</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge className={cn("rounded-full px-2.5 py-0.5", roleBadgeClassName(role))} variant="outline">
      {role === "admin" ? "Admin" : "User"}
    </Badge>
  );
}

function StatusBadge({ status }: { status: AccessStatus }) {
  return (
    <Badge
      className={cn("rounded-full px-2.5 py-0.5 capitalize", statusBadgeClassName(status))}
      variant="outline"
    >
      {status}
    </Badge>
  );
}
