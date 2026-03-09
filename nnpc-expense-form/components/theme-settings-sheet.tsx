"use client";

import { MoonStar, Palette, Settings2, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type ThemeSettingsSheetProps = {
  userEmail?: string;
  className?: string;
};

export function ThemeSettingsSheet({
  userEmail,
  className,
}: ThemeSettingsSheetProps) {
  const { setTheme, theme } = useTheme();
  const isDarkMode = theme !== "light";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          className={cn(
            "rounded-full border-white/10 bg-background/70 px-4 text-foreground shadow-none backdrop-blur-xl hover:bg-background/90",
            className,
          )}
          size="sm"
          variant="outline"
        >
          <Settings2 className="size-4" />
          Settings
        </Button>
      </SheetTrigger>

      <SheetContent className="border-border/60 bg-background/95 sm:max-w-md">
        <SheetHeader className="space-y-3 border-b border-border/60 px-6 py-6">
          <Badge className="w-fit rounded-full px-3 py-1" variant="secondary">
            Workspace controls
          </Badge>
          <SheetTitle className="font-serif text-2xl tracking-tight">
            Display settings
          </SheetTitle>
          <SheetDescription className="max-w-xs text-sm leading-6">
            Dark mode starts by default. Use the theme switch to move between the
            black, white, and green brand palette.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-6 py-6">
          <Card className="premium-panel rounded-3xl border-border/70 py-0 shadow-none">
            <CardHeader className="gap-3 px-5 pt-5">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base">Theme mode</CardTitle>
                  <CardDescription>
                    Toggle the interface between a dark executive canvas and a
                    bright review mode.
                  </CardDescription>
                </div>
                <Switch
                  aria-label="Toggle dark mode"
                  checked={isDarkMode}
                  onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                />
              </div>
            </CardHeader>

            <CardContent className="space-y-4 px-5 pb-5">
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-left transition",
                    isDarkMode
                      ? "border-primary/40 bg-primary/12 text-foreground"
                      : "border-border/70 bg-background/70 text-muted-foreground hover:bg-accent/60",
                  )}
                  type="button"
                  onClick={() => setTheme("dark")}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MoonStar className="size-4" />
                    Dark
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Default startup mode
                  </p>
                </button>

                <button
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-left transition",
                    !isDarkMode
                      ? "border-primary/40 bg-primary/12 text-foreground"
                      : "border-border/70 bg-background/70 text-muted-foreground hover:bg-accent/60",
                  )}
                  type="button"
                  onClick={() => setTheme("light")}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <SunMedium className="size-4" />
                    Light
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Clean review mode
                  </p>
                </button>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Palette className="size-4 text-primary" />
                  Brand palette
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="size-6 rounded-full border border-white/10 bg-black" />
                  <span className="size-6 rounded-full border border-black/10 bg-white" />
                  <span className="size-6 rounded-full border border-white/10 bg-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70 py-0 shadow-none">
            <CardHeader className="gap-2 px-5 pt-5">
              <CardTitle className="text-base">Session</CardTitle>
              <CardDescription>
                This prototype stores reports and assets in Supabase.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <p className="text-sm text-muted-foreground">
                {userEmail ?? "Sign in to load a user session."}
              </p>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
