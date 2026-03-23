"use client";

import Link from "next/link";
import { type AccountRole } from "@/lib/user-account-data";
import { cn } from "@/lib/utils";

type RouteSection =
  | "expenses"
  | "companies"
  | "expense-insight"
  | "user-management";

export function TopRouteTabs({
  activeSection,
  accountRole,
}: {
  activeSection: RouteSection;
  accountRole?: AccountRole | null;
}) {
  const showAdminRoutes = accountRole === "admin" || accountRole === "central_admin";
  const tabs: Array<{
    href: string;
    key: RouteSection;
    label: string;
  }> = [
    {
      href: "/dashboard",
      key: "expenses",
      label: "Expenses",
    },
    {
      href: "/companies",
      key: "companies",
      label: "Company Headers",
    },
    ...(showAdminRoutes
      ? [
          {
            href: "/admin/expenses",
            key: "expense-insight" as const,
            label: "Expenses Insight",
          },
          {
            href: "/admin/users",
            key: "user-management" as const,
            label: "User Management",
          },
        ]
      : []),
  ];

  return (
    <nav aria-label="Primary" className="mt-6 overflow-x-auto">
      <div className="flex min-w-max items-end gap-1 border-b border-border bg-muted/20 px-1 pt-1">
        {tabs.map((tab) => (
          <Link
            aria-current={activeSection === tab.key ? "page" : undefined}
            className={cn(
              "relative -mb-px flex min-h-11 items-center justify-center rounded-t-md border border-transparent px-4 py-2.5 text-center text-sm font-medium transition",
              activeSection === tab.key
                ? "border-border border-b-background bg-background text-foreground"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
            href={tab.href}
            key={tab.key}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
