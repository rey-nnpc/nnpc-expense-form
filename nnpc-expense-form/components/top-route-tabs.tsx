"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type RouteSection = "expenses" | "companies";

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
  ];

  return (
    <nav
      aria-label="Primary"
      className="mt-5 inline-flex w-full flex-wrap items-center gap-2 rounded-[1.75rem] border border-white/10 bg-background/55 p-2 backdrop-blur-xl"
    >
      {tabs.map((tab) => (
        <Link
          className={cn(
            "rounded-[1.15rem] px-4 py-2 text-sm font-medium transition",
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
