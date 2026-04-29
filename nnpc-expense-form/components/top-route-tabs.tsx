"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  BadgeCheck,
  Building2,
  FileText,
  LayoutPanelTop,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { type AccountRole } from "@/lib/user-account-data";
import { cn } from "@/lib/utils";

type RouteSection =
  | "expenses"
  | "companies"
  | "profile"
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
  const tabGroups: Array<{
    label: string;
    tabs: Array<{
      href: string;
      icon: ComponentType<{ className?: string }>;
      key: RouteSection;
      label: string;
    }>;
  }> = [
    {
      label: "Workspace",
      tabs: [
        {
          href: "/dashboard",
          icon: FileText,
          key: "expenses",
          label: "Expenses",
        },
      ],
    },
    {
      label: "Setup",
      tabs: [
        {
          href: "/companies",
          icon: Building2,
          key: "companies",
          label: "Company Headers",
        },
        {
          href: "/profile",
          icon: UserRound,
          key: "profile",
          label: "Profile",
        },
      ],
    },
    ...(showAdminRoutes
      ? [
          {
            label: "Admin",
            tabs: [
              {
                href: "/admin/expenses",
                icon: LayoutPanelTop,
                key: "expense-insight" as const,
                label: "Expenses Insight",
              },
              {
                href: "/admin/users",
                icon: ShieldCheck,
                key: "user-management" as const,
                label: "User Management",
              },
            ],
          },
        ]
      : []),
  ];

  return (
    <nav aria-label="Primary" className="mt-6 overflow-x-auto">
      <div className="flex min-w-max flex-col gap-3 lg:min-w-0 lg:flex-row lg:flex-wrap lg:items-end">
        {tabGroups.map((group) => (
          <div className="min-w-max" key={group.label}>
            <p className="mb-2 px-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {group.label === "Setup" ? (
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="size-3.5 text-primary" />
                  {group.label}
                </span>
              ) : (
                group.label
              )}
            </p>
            <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-muted/20 p-1.5 backdrop-blur-sm">
              {group.tabs.map((tab) => {
                const Icon = tab.icon;

                return (
                  <Link
                    aria-current={activeSection === tab.key ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-[1rem] border px-4 py-2.5 text-sm font-medium transition",
                      activeSection === tab.key
                        ? "border-border bg-background text-foreground shadow-[0_12px_24px_-18px_rgba(15,23,42,0.45)]"
                        : "border-transparent text-muted-foreground hover:bg-background/65 hover:text-foreground",
                    )}
                    href={tab.href}
                    key={tab.key}
                  >
                    <Icon className="size-4" />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
