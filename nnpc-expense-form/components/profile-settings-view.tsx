"use client";

import { useEffect, useState } from "react";
import { IdCard, LogOut, Save, UserRound } from "lucide-react";
import AuthGate, { type AuthSession } from "@/components/auth-gate";
import { ThemeSettingsSheet } from "@/components/theme-settings-sheet";
import { TopRouteTabs } from "@/components/top-route-tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getUserProfile,
  SESSION_EXPIRED_MESSAGE,
  upsertUserProfile,
  type UserProfile,
} from "@/lib/profile-data";
import { type UserAccount } from "@/lib/user-account-data";

type ProfileMessage = {
  tone: "error" | "info";
  text: string;
};

export default function ProfileSettingsView() {
  return (
    <AuthGate>
      {({ account, session, logout }) => (
        <ProtectedProfileSettings account={account} logout={logout} session={session} />
      )}
    </AuthGate>
  );
}

function ProtectedProfileSettings({
  account,
  logout,
  session,
}: {
  account: UserAccount;
  logout: () => Promise<void>;
  session: AuthSession;
}) {
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [message, setMessage] = useState<ProfileMessage | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    let isActive = true;

    void getUserProfile(session.accessToken)
      .then((profile) => {
        if (!isActive) {
          return;
        }

        setFullName(profile?.fullName ?? "");
        setDepartment(profile?.department ?? "");
        setMessage(null);
      })
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
              : "Your profile could not be loaded from Supabase.",
        });
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingProfile(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [logout, session.accessToken]);

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    setMessage(null);

    try {
      const savedProfile = await upsertUserProfile({
        accessToken: session.accessToken,
        department,
        fullName,
      });

      setFullName(savedProfile.fullName);
      setDepartment(savedProfile.department);
      setMessage({
        tone: "info",
        text: "Profile saved. New expense pages will use these defaults.",
      });
    } catch (error) {
      if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
        void logout();
        return;
      }

      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Your profile could not be saved.",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const previewProfile: UserProfile = {
    department: department.trim(),
    fullName: fullName.trim(),
  };

  return (
    <div className="page-shell min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Profile
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{session.userEmail}</p>
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

        <TopRouteTabs accountRole={account.role} activeSection="profile" />

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
          <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
            <CardHeader className="gap-3 border-b border-border/60 px-5 py-5 sm:px-6 sm:py-6">
              <Badge className="rounded-full px-3 py-1" variant="secondary">
                User profile
              </Badge>
              <CardTitle className="font-serif text-3xl tracking-tight">Default form values</CardTitle>
              <CardDescription className="text-sm leading-7">
                These values prefill new expense pages. You can still adjust them per report.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
              {isLoadingProfile ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-background/60 px-5 py-8 text-sm text-muted-foreground">
                  Loading your profile from Supabase...
                </div>
              ) : (
                <>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">Full name</span>
                    <Input
                      className="h-11 rounded-2xl border-white/10 bg-background/75 px-4"
                      placeholder="Your name for new expense forms"
                      type="text"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">Department</span>
                    <Input
                      className="h-11 rounded-2xl border-white/10 bg-background/75 px-4"
                      placeholder="Your department for new expense forms"
                      type="text"
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                    />
                  </label>

                  <Button
                    className="h-11 rounded-2xl px-5 sm:w-fit"
                    disabled={isSavingProfile}
                    type="button"
                    onClick={handleSaveProfile}
                  >
                    <Save className="size-4" />
                    {isSavingProfile ? "Saving..." : "Save profile"}
                  </Button>
                </>
              )}

              {message ? (
                <Alert variant={message.tone === "error" ? "destructive" : "default"}>
                  <AlertTitle>{message.tone === "error" ? "Profile issue" : "Profile saved"}</AlertTitle>
                  <AlertDescription>{message.text}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-[2rem] border-border/60 py-0">
              <CardContent className="px-5 py-5">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  Preview
                </p>
                <div className="mt-4 space-y-4">
                  <div className="flex items-start gap-3 rounded-3xl border border-white/10 bg-background/65 p-4">
                    <span className="mt-1 flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                      <UserRound className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                        Default employee name
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {previewProfile.fullName || "Will fall back to your email name"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-3xl border border-white/10 bg-background/65 p-4">
                    <span className="mt-1 flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                      <IdCard className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                        Default department
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {previewProfile.department || "Blank until you add one"}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
