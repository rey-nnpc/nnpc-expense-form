"use client";

import Image from "next/image";
import { useEffect, useState, type ChangeEvent } from "react";
import { Building2, LogOut, PencilLine, Plus } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { readCompaniesCache, writeCompaniesCache } from "@/lib/browser-cache";
import {
  SESSION_EXPIRED_MESSAGE,
  createUserCompany,
  listUserCompanies,
  updateUserCompany,
  type CompanyRecord,
} from "@/lib/company-data";
import { type UserAccount } from "@/lib/user-account-data";

type CompanyMessage = {
  tone: "error" | "info";
  text: string;
};

export default function CompanySettingsView() {
  return (
    <AuthGate>
      {({ account, session, logout }) => (
        <ProtectedCompanySettings account={account} logout={logout} session={session} />
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
  account,
  logout,
  session,
}: {
  account: UserAccount;
  logout: () => Promise<void>;
  session: AuthSession;
}) {
  const cacheUserKey = session.userEmail;
  const [companyAddressDraft, setCompanyAddressDraft] = useState("");
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [companyNameDraft, setCompanyNameDraft] = useState("");
  const [companyTaxIdDraft, setCompanyTaxIdDraft] = useState("");
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoDraft, setCompanyLogoDraft] = useState("");
  const [companyMessage, setCompanyMessage] = useState<CompanyMessage | null>(null);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyRecord | null>(null);
  const [editCompanyAddressDraft, setEditCompanyAddressDraft] = useState("");
  const [editCompanyNameDraft, setEditCompanyNameDraft] = useState("");
  const [editCompanyTaxIdDraft, setEditCompanyTaxIdDraft] = useState("");
  const [editCompanyLogoFile, setEditCompanyLogoFile] = useState<File | null>(null);
  const [editCompanyLogoDraft, setEditCompanyLogoDraft] = useState("");
  const [editCompanyMessage, setEditCompanyMessage] = useState<CompanyMessage | null>(null);
  const [isUpdatingCompany, setIsUpdatingCompany] = useState(false);

  useEffect(() => {
    let isActive = true;
    const loadCompanies = async () => {
      const cachedCompanies = readCompaniesCache(cacheUserKey);

      if (cachedCompanies) {
        if (!isActive) {
          return;
        }

        setCompanies(cachedCompanies);
        setCompanyMessage(null);
        return;
      }

      const nextCompanies = await listUserCompanies(session.accessToken);

      if (!isActive) {
        return;
      }

      setCompanies(nextCompanies);
      setCompanyMessage(null);
      writeCompaniesCache(cacheUserKey, nextCompanies);
    };

    void loadCompanies()
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
  }, [cacheUserKey, logout, session.accessToken]);

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
    } finally {
      event.target.value = "";
    }
  };

  const resetEditCompanyState = () => {
    setEditingCompany(null);
    setEditCompanyAddressDraft("");
    setEditCompanyNameDraft("");
    setEditCompanyTaxIdDraft("");
    setEditCompanyLogoFile(null);
    setEditCompanyLogoDraft("");
    setEditCompanyMessage(null);
  };

  const openEditCompany = (company: CompanyRecord) => {
    setEditingCompany(company);
    setEditCompanyAddressDraft(company.companyAddress);
    setEditCompanyNameDraft(company.companyName);
    setEditCompanyTaxIdDraft(company.companyTaxId);
    setEditCompanyLogoFile(null);
    setEditCompanyLogoDraft(company.logoUrl);
    setEditCompanyMessage(null);
    setCompanyMessage(null);
  };

  const handleEditCompanyLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);

    if (!file) {
      return;
    }

    try {
      const nextLogoDraft = await readCompanyLogoAsDataUrl(file);
      setEditCompanyLogoFile(file);
      setEditCompanyLogoDraft(nextLogoDraft);
      setEditCompanyMessage(null);
    } catch {
      setEditCompanyMessage({
        tone: "error",
        text: "The replacement logo could not be read.",
      });
    } finally {
      event.target.value = "";
    }
  };

  const resetEditCompanyLogo = () => {
    setEditCompanyLogoFile(null);
    setEditCompanyLogoDraft(editingCompany?.logoUrl ?? "");
    setEditCompanyMessage(null);
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
        companyAddress: companyAddressDraft,
        companyName: companyNameDraft,
        companyTaxId: companyTaxIdDraft,
        logoFile: companyLogoFile,
      });

      setCompanies((currentCompanies) => {
        const nextCompanies = [savedCompany, ...currentCompanies];
        writeCompaniesCache(cacheUserKey, nextCompanies);
        return nextCompanies;
      });
      setCompanyAddressDraft("");
      setCompanyNameDraft("");
      setCompanyTaxIdDraft("");
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

  const handleUpdateCompany = async () => {
    if (!editingCompany) {
      return;
    }

    if (!editCompanyNameDraft.trim()) {
      setEditCompanyMessage({
        tone: "error",
        text: "Company name is required.",
      });
      return;
    }

    setIsUpdatingCompany(true);
    setEditCompanyMessage(null);

    try {
      const savedCompany = await updateUserCompany({
        accessToken: session.accessToken,
        companyAddress: editCompanyAddressDraft,
        companyId: editingCompany.id,
        companyName: editCompanyNameDraft,
        companyTaxId: editCompanyTaxIdDraft,
        currentCompany: editingCompany,
        logoFile: editCompanyLogoFile,
      });

      setCompanies((currentCompanies) => {
        const nextCompanies = currentCompanies.map((company) =>
          company.id === savedCompany.id ? savedCompany : company,
        );

        writeCompaniesCache(cacheUserKey, nextCompanies);
        return nextCompanies;
      });

      setCompanyMessage({
        tone: "info",
        text: `${savedCompany.companyName} updated.`,
      });
      resetEditCompanyState();
    } catch (error) {
      if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
        void logout();
        return;
      }

      setEditCompanyMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The company could not be updated in Supabase.",
      });
    } finally {
      setIsUpdatingCompany(false);
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

        <TopRouteTabs accountRole={account.role} activeSection="companies" />

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
            <CardHeader className="gap-3 border-b border-border/60 px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="font-serif text-3xl tracking-tight">
                    Library
                  </CardTitle>
                  <CardDescription className="mt-1 max-w-2xl text-sm leading-7">
                    Save reusable company names and logos once, then edit or reuse them
                    from each day sheet before export.
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
                      className="flex flex-col gap-4 rounded-[1.5rem] border border-white/10 bg-background/65 p-4 sm:flex-row sm:items-center sm:justify-between"
                      key={company.id}
                    >
                      <div className="flex min-w-0 items-center gap-4">
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
                          {company.companyTaxId ? (
                            <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                              Tax ID {company.companyTaxId}
                            </p>
                          ) : null}
                          {company.companyAddress ? (
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                              {company.companyAddress}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Export ready
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end">
                        <Button
                          className="rounded-full px-4"
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => openEditCompany(company)}
                        >
                          <PencilLine className="size-4" />
                          Edit
                        </Button>
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
                  Save the full PDF header once, including the address that prints in the
                  top-right area.
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
                  <span className="text-sm font-medium text-foreground">Company Tax ID</span>
                  <Input
                    className="h-11 rounded-2xl border-white/10 bg-background/75 px-4"
                    placeholder="0105539123456"
                    type="text"
                    value={companyTaxIdDraft}
                    onChange={(event) => setCompanyTaxIdDraft(event.target.value)}
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-foreground">Company address</span>
                  <Textarea
                    className="min-h-24 rounded-2xl border-white/10 bg-background/75 px-4 py-3"
                    placeholder="99 Example Tower, 18th Floor, Sukhumvit Road, Khlong Toei, Bangkok 10110"
                    value={companyAddressDraft}
                    onChange={(event) => setCompanyAddressDraft(event.target.value)}
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
                    {companyTaxIdDraft ? (
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Tax ID {companyTaxIdDraft}
                      </p>
                    ) : null}
                    {companyAddressDraft ? (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {companyAddressDraft}
                      </p>
                    ) : null}
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

      <Dialog
        open={editingCompany !== null}
        onOpenChange={(open) => {
          if (!open && !isUpdatingCompany) {
            resetEditCompanyState();
          }
        }}
      >
        <DialogContent
          className="rounded-[2rem] border-border/60 p-0 sm:max-w-[44rem]"
          showCloseButton={!isUpdatingCompany}
          onInteractOutside={(event) => {
            if (isUpdatingCompany) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader className="gap-3 border-b border-border/60 px-6 py-5">
            <BadgeLike label="Saved header" />
            <DialogTitle className="font-serif text-3xl tracking-tight">
              Edit company
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-sm leading-7">
              Update the saved company name, tax ID, address, or logo. The changes
              will be available in the export selector right away.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 px-6 py-6 md:grid-cols-[minmax(0,1.1fr)_15rem]">
            <div className="space-y-5">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">Company name</span>
                <Input
                  className="h-11 rounded-2xl border-white/10 bg-background/75 px-4"
                  placeholder="NNPC Consulting Company Limited"
                  type="text"
                  value={editCompanyNameDraft}
                  onChange={(event) => setEditCompanyNameDraft(event.target.value)}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">Company Tax ID</span>
                <Input
                  className="h-11 rounded-2xl border-white/10 bg-background/75 px-4"
                  placeholder="0105539123456"
                  type="text"
                  value={editCompanyTaxIdDraft}
                  onChange={(event) => setEditCompanyTaxIdDraft(event.target.value)}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">Company address</span>
                <Textarea
                  className="min-h-24 rounded-2xl border-white/10 bg-background/75 px-4 py-3"
                  placeholder="99 Example Tower, 18th Floor, Sukhumvit Road, Khlong Toei, Bangkok 10110"
                  value={editCompanyAddressDraft}
                  onChange={(event) => setEditCompanyAddressDraft(event.target.value)}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground">Replace company logo</span>
                <Input
                  className="h-12 rounded-2xl border-white/10 bg-background/75 px-4 file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void handleEditCompanyLogoChange(event);
                  }}
                />
              </label>

              {editCompanyLogoFile ? (
                <div className="flex justify-start">
                  <Button
                    className="rounded-full px-4"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={resetEditCompanyLogo}
                  >
                    Keep current logo
                  </Button>
                </div>
              ) : null}

              {editCompanyMessage ? (
                <div
                  className={`rounded-3xl border px-4 py-3 text-sm ${
                    editCompanyMessage.tone === "error"
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-primary/20 bg-primary/10 text-foreground"
                  }`}
                >
                  {editCompanyMessage.text}
                </div>
              ) : null}
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-background/60 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Updated preview
              </p>
              <div className="mt-4 flex flex-col items-center text-center">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-background/85">
                  {editCompanyLogoDraft ? (
                    <Image
                      alt={editCompanyNameDraft || "Company logo preview"}
                      className="h-full w-full object-contain"
                      height={192}
                      src={editCompanyLogoDraft}
                      unoptimized
                      width={192}
                    />
                  ) : (
                    <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Logo
                    </span>
                  )}
                </div>

                <p className="mt-4 text-sm font-medium text-foreground">
                  {editCompanyNameDraft || "Company name"}
                </p>
                {editCompanyTaxIdDraft ? (
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Tax ID {editCompanyTaxIdDraft}
                  </p>
                ) : (
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    No tax ID saved
                  </p>
                )}
                {editCompanyAddressDraft ? (
                  <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted-foreground">
                    {editCompanyAddressDraft}
                  </p>
                ) : null}
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  This header will show anywhere the saved company is reused for export.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 px-6 py-5">
            <Button
              className="rounded-full"
              disabled={isUpdatingCompany}
              type="button"
              variant="outline"
              onClick={resetEditCompanyState}
            >
              Cancel
            </Button>
            <Button
              className="rounded-full px-5"
              disabled={isUpdatingCompany}
              type="button"
              onClick={() => {
                void handleUpdateCompany();
              }}
            >
              <PencilLine className="size-4" />
              {isUpdatingCompany ? "Saving changes..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
