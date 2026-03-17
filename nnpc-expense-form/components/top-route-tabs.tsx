"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type RouteSection = "expenses" | "companies" | "admin";

export function TopRouteTabs({
  activeSection,
}: {
  activeSection: RouteSection;
}) {
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
    {
      href: "/admin",
      key: "admin",
      label: "Admin",
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className="mt-5 grid w-full grid-cols-3 gap-1.5 rounded-[1.2rem] border border-white/10 bg-background/55 p-1.5 backdrop-blur-xl sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:rounded-[1.75rem] sm:p-2"
    >
      {tabs.map((tab) => (
        <Link
          className={cn(
            "flex min-h-10 items-center justify-center rounded-[0.95rem] px-3 py-2 text-center text-sm font-medium transition sm:rounded-[1.15rem] sm:px-4",
            activeSection === tab.key
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
          )}
          href={tab.href}
          key={tab.key}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
