"use client";

import Image from "next/image";
import { useEffect, useState, type ChangeEvent } from "react";
import { Building2, LogOut, Plus } from "lucide-react";
import AuthGate, { type AuthSession } from "@/components/auth-gate";
import { ThemeSettingsSheet } from "@/components/theme-settings-sheet";
import { TopRouteTabs } from "@/components/top-route-tabs";
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
  SESSION_EXPIRED_MESSAGE,
  createUserCompany,
  listUserCompanies,
  type CompanyRecord,
} from "@/lib/company-data";

type CompanyMessage = {
  tone: "error" | "info";
  text: string;
};

export default function CompanySettingsView() {
  return (
    <AuthGate>
      {({ session, logout }) => (
        <ProtectedCompanySettings logout={logout} session={session} />
      )}
    </AuthGate>
  );
}

function readCompanyLogoAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Company logo preview failed."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Company logo preview failed."));
    };

    reader.readAsDataURL(file);
  });
}

function ProtectedCompanySettings({
  logout,
  session,
}: {
  logout: () => Promise<void>;
  session: AuthSession;
}) {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [companyNameDraft, setCompanyNameDraft] = useState("");
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoDraft, setCompanyLogoDraft] = useState("");
  const [companyMessage, setCompanyMessage] = useState<CompanyMessage | null>(null);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  useEffect(() => {
    let isActive = true;

    void listUserCompanies(session.accessToken)
      .then((nextCompanies) => {
        if (!isActive) {
          return;
        }

        setCompanies(nextCompanies);
        setCompanyMessage(null);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
          void logout();
          return;
        }

        setCompanyMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Saved companies could not be loaded from Supabase.",
        });
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingCompanies(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [logout, session.accessToken]);

  const handleCompanyLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);

    if (!file) {
      setCompanyLogoFile(null);
      setCompanyLogoDraft("");
      return;
    }

    try {
      const nextLogoDraft = await readCompanyLogoAsDataUrl(file);
      setCompanyLogoFile(file);
      setCompanyLogoDraft(nextLogoDraft);
      setCompanyMessage(null);
    } catch {
      setCompanyMessage({
        tone: "error",
        text: "The selected logo could not be read.",
      });
    }
  };

  const handleSaveCompany = async () => {
    if (!companyNameDraft.trim()) {
      setCompanyMessage({
        tone: "error",
        text: "Company name is required.",
      });
      return;
    }

    if (!companyLogoFile) {
      setCompanyMessage({
        tone: "error",
        text: "Upload a company logo before saving.",
      });
      return;
    }

    setIsSavingCompany(true);
    setCompanyMessage(null);

    try {
      const savedCompany = await createUserCompany({
        accessToken: session.accessToken,
        companyName: companyNameDraft,
        logoFile: companyLogoFile,
      });

      setCompanies((currentCompanies) => [savedCompany, ...currentCompanies]);
      setCompanyNameDraft("");
      setCompanyLogoFile(null);
      setCompanyLogoDraft("");
      setCompanyMessage({
        tone: "info",
        text: "Company header saved. It is ready for the export selector.",
      });
    } catch (error) {
      if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
        void logout();
        return;
      }

      setCompanyMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The company could not be saved to Supabase.",
      });
    } finally {
      setIsSavingCompany(false);
    }
  };

  return (
    <div className="page-shell min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Company Headers
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {session.userEmail}
            </p>
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

        <TopRouteTabs activeSection="companies" />

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
            <CardHeader className="gap-3 border-b border-border/60 px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="font-serif text-3xl tracking-tight">
                    Library
                  </CardTitle>
                  <CardDescription className="mt-1 max-w-2xl text-sm leading-7">
                    Save reusable company names and logos once, then select them from
                    each day sheet before export.
                  </CardDescription>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-background/65 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  <Building2 className="size-4 text-primary" />
                  {companies.length} saved
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
              {isLoadingCompanies ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-background/60 px-5 py-8 text-sm text-muted-foreground">
                  Loading saved companies from Supabase...
                </div>
              ) : companies.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-background/60 px-5 py-8 text-sm text-muted-foreground">
                  No companies saved yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {companies.map((company) => (
                    <article
                      className="flex items-center gap-4 rounded-[1.5rem] border border-white/10 bg-background/65 p-4"
                      key={company.id}
                    >
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-background/85">
                        <Image
                          alt={company.companyName}
                          className="h-full w-full object-contain"
                          height={128}
                          src={company.logoUrl}
                          unoptimized
                          width={128}
                        />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {company.companyName}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          Export ready
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
              <CardHeader className="gap-3 border-b border-border/60 px-5 py-5">
                <BadgeLike label="New header" />
                <CardTitle className="font-serif text-3xl tracking-tight">
                  Add company
                </CardTitle>
                <CardDescription className="text-sm leading-7">
                  Keep the export setup separate from the daily expense editor.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5 px-5 py-5">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Company name</span>
                  <Input
                    className="h-11 rounded-2xl border-white/10 bg-background/75 px-4"
                    placeholder="NNPC Consulting Company Limited"
                    type="text"
                    value={companyNameDraft}
                    onChange={(event) => setCompanyNameDraft(event.target.value)}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Company logo</span>
                  <Input
                    className="h-12 rounded-2xl border-white/10 bg-background/75 px-4 file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      void handleCompanyLogoChange(event);
                    }}
                  />
                </label>

                <Button
                  className="h-11 rounded-2xl px-5 sm:w-fit"
                  type="button"
                  onClick={handleSaveCompany}
                  disabled={isSavingCompany}
                >
                  <Plus className="size-4" />
                  {isSavingCompany ? "Saving..." : "Save company"}
                </Button>

                {companyMessage ? (
                  <div
                    className={`rounded-3xl border px-4 py-3 text-sm ${
                      companyMessage.tone === "error"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-primary/20 bg-primary/10 text-foreground"
                    }`}
                  >
                    {companyMessage.text}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-border/60 py-0">
              <CardContent className="px-5 py-5">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  Header preview
                </p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-background/80">
                    {companyLogoDraft ? (
                      <Image
                        alt={companyNameDraft || "Company logo preview"}
                        className="h-full w-full object-contain"
                        height={160}
                        src={companyLogoDraft}
                        unoptimized
                        width={160}
                      />
                    ) : (
                      <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        Logo
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {companyNameDraft || "Your saved company name appears here"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      This exact header is printed on the export form.
                    </p>
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

function BadgeLike({
  label,
}: {
  label: string;
}) {
  return (
    <div className="inline-flex w-fit items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
      {label}
    </div>
  );
}
