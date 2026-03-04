"use client";

import Image from "next/image";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe2,
  ImagePlus,
  LogOut,
  NotebookPen,
  Plus,
  Printer,
  Receipt,
  Trash2,
  UserRound,
} from "lucide-react";
import { ThemeSettingsSheet } from "@/components/theme-settings-sheet";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TopRouteTabs } from "@/components/top-route-tabs";
import AuthGate, { type AuthSession } from "./auth-gate";
import {
  SESSION_EXPIRED_MESSAGE,
  listUserCompanies,
  type CompanyRecord,
} from "../lib/company-data";
import { formatDisplayDate } from "../lib/date";
import {
  EXPENSE_TYPES,
  buildRemarkSummary,
  createEmptyRow,
  deriveDisplayName,
  findExpenseTypeLabel,
  formatCurrency,
  formatFileSize,
  hasRowContent,
  parseAmount,
  type ExpenseRow,
  type ExportLanguage,
  type ReceiptDraft,
} from "../lib/expense-data";
import {
  buildRowsFromLoadedReport,
  getExpenseDay,
  upsertExpenseDay,
} from "../lib/report-data";

const EMPTY_COMPANY_VALUE = "__none__";

const EXPORT_COPY: Record<
  ExportLanguage,
  {
    formTitle: string;
    formSubtitle: string;
    companyCaption: string;
    companyPending: string;
    date: string;
    employee: string;
    note: string;
    line: string;
    details: string;
    amount: string;
    total: string;
    noExpenses: string;
    emptyRemark: string;
    noteFallback: string;
    receiptLabel: string;
    expenseLabel: string;
    signatures: [string, string, string];
    signatureHint: string;
  }
> = {
  en: {
    formTitle: "Expense reimbursement form",
    formSubtitle: "For expenses without invoice / receipt",
    companyCaption: "Company",
    companyPending: "Select a company in Company Headers",
    date: "Date",
    employee: "Employee",
    note: "Note",
    line: "No.",
    details: "Expense details",
    amount: "Amount",
    total: "Total amount",
    noExpenses: "No expenses added for this day.",
    emptyRemark: "No extra remark",
    noteFallback: "No additional note.",
    receiptLabel: "Receipt Image",
    expenseLabel: "Expense",
    signatures: ["Requester", "Cash recipient", "Approver"],
    signatureHint: "Sign here",
  },
  th: {
    formTitle: "ใบเบิกค่าใช้จ่าย",
    formSubtitle: "สำหรับค่าใช้จ่ายที่ไม่มีใบกำกับ / ใบเสร็จ",
    companyCaption: "บริษัท",
    companyPending: "กรุณาเลือกบริษัทจากแท็บ Company Headers",
    date: "วันที่",
    employee: "ชื่อผู้เบิก",
    note: "หมายเหตุ",
    line: "ลำดับ",
    details: "รายการค่าใช้จ่าย",
    amount: "จำนวนเงิน",
    total: "รวมจำนวนเงิน",
    noExpenses: "ยังไม่มีรายการค่าใช้จ่ายสำหรับวันนี้",
    emptyRemark: "ไม่มีรายละเอียดเพิ่มเติม",
    noteFallback: "ไม่มีหมายเหตุเพิ่มเติม",
    receiptLabel: "รูปใบเสร็จ",
    expenseLabel: "รายการ",
    signatures: ["ผู้เสนอเบิก", "พนักงานผู้รับเงิน", "ผู้อนุมัติ"],
    signatureHint: "ลงชื่อ",
  },
};

const THAI_EXPENSE_TYPE_LABELS: Record<string, string> = {
  transportation: "ค่าใช้จ่ายในการเดินทาง",
  client_food: "ค่าอาหารลูกค้า",
  gas: "ค่าน้ำมัน",
  toll_fee: "ค่าทางด่วน",
  misc: "ค่าใช้จ่ายอื่น ๆ",
};

export default function ExpenseEditorView({
  expenseDate,
}: {
  expenseDate: string;
}) {
  return (
    <AuthGate>
      {({ session, logout }) => (
        <ProtectedExpenseEditor
          expenseDate={expenseDate}
          logout={logout}
          session={session}
        />
      )}
    </AuthGate>
  );
}

async function toReceiptDrafts(rowId: number, files: FileList | null) {
  const fileEntries = Array.from(files ?? []);

  return Promise.all(
    fileEntries.map(async (file, index) => ({
      id: `${rowId}-${index}-${file.name}`,
      file,
      fileSizeBytes: file.size,
      mimeType: file.type || null,
      name: file.name,
      previewUrl: await readFileAsDataUrl(file),
      sizeLabel: formatFileSize(file.size),
    })),
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("File preview failed."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("File preview failed."));
    };

    reader.readAsDataURL(file);
  });
}

function ProtectedExpenseEditor({
  expenseDate,
  logout,
  session,
}: {
  expenseDate: string;
  logout: () => Promise<void>;
  session: AuthSession;
}) {
  const defaultEmployeeName = deriveDisplayName(session.userEmail);
  const [employeeName, setEmployeeName] = useState(defaultEmployeeName);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [loadedCompanyId, setLoadedCompanyId] = useState("");
  const [loadedCompanyName, setLoadedCompanyName] = useState("");
  const [loadedCompanyLogoBucketName, setLoadedCompanyLogoBucketName] = useState("");
  const [loadedCompanyLogoObjectPath, setLoadedCompanyLogoObjectPath] = useState("");
  const [loadedCompanyLogoUrl, setLoadedCompanyLogoUrl] = useState("");
  const [exportLanguage, setExportLanguage] = useState<ExportLanguage>("en");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [isLoadingDocument, setIsLoadingDocument] = useState(true);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastPrintedAt, setLastPrintedAt] = useState<string | null>(null);
  const pendingSaveRef = useRef<{
    companyId: string;
    companyLogoBucketName: string;
    companyLogoObjectPath: string;
    companyName: string;
    employeeName: string;
    exportLanguage: ExportLanguage;
    note: string;
    rows: ExpenseRow[];
  } | null>(null);
  const isPersistingRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const skipNextAutosaveRef = useRef(true);
  const hasLoadedDocumentRef = useRef(false);

  useEffect(() => {
    let isActive = true;

    const loadDocument = async () => {
      const [nextCompanies, existingReport] = await Promise.all([
        listUserCompanies(session.accessToken),
        getExpenseDay(session.accessToken, expenseDate),
      ]);

      if (!isActive) {
        return;
      }

      setCompanies(nextCompanies);
      setDocumentError(null);

      if (!existingReport) {
        setEmployeeName(defaultEmployeeName);
        setSelectedCompanyId("");
        setLoadedCompanyId("");
        setLoadedCompanyName("");
        setLoadedCompanyLogoBucketName("");
        setLoadedCompanyLogoObjectPath("");
        setLoadedCompanyLogoUrl("");
        setExportLanguage("en");
        setNote("");
        setRows([]);
      } else {
        setEmployeeName(existingReport.employeeName || defaultEmployeeName);
        setSelectedCompanyId(existingReport.companyId);
        setLoadedCompanyId(existingReport.companyId);
        setLoadedCompanyName(existingReport.companyName);
        setLoadedCompanyLogoBucketName(existingReport.companyLogoBucketName);
        setLoadedCompanyLogoObjectPath(existingReport.companyLogoObjectPath);
        setLoadedCompanyLogoUrl(existingReport.companyLogoUrl);
        setExportLanguage(existingReport.exportLanguage);
        setNote(existingReport.note);
        setRows(buildRowsFromLoadedReport(existingReport.rows));
      }

      skipNextAutosaveRef.current = true;
      hasLoadedDocumentRef.current = true;
    };

    void loadDocument()
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
          void logout();
          return;
        }

        setDocumentError(
          error instanceof Error
            ? error.message
            : "This expense day could not be loaded from Supabase.",
        );
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingDocument(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [defaultEmployeeName, expenseDate, logout, session.accessToken]);

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);
  const selectedCompanyName =
    selectedCompany?.companyName ??
    (selectedCompanyId && selectedCompanyId === loadedCompanyId ? loadedCompanyName : "");
  const selectedCompanyLogoBucketName =
    selectedCompany?.logoBucketName ??
    (selectedCompanyId && selectedCompanyId === loadedCompanyId
      ? loadedCompanyLogoBucketName
      : "");
  const selectedCompanyLogoObjectPath =
    selectedCompany?.logoObjectPath ??
    (selectedCompanyId && selectedCompanyId === loadedCompanyId
      ? loadedCompanyLogoObjectPath
      : "");
  const selectedCompanyLogoUrl =
    selectedCompany?.logoUrl ??
    (selectedCompanyId && selectedCompanyId === loadedCompanyId ? loadedCompanyLogoUrl : "");

  const flushPendingSave = useEffectEvent(async () => {
    if (isPersistingRef.current || !pendingSaveRef.current) {
      return;
    }

    const nextSnapshot = pendingSaveRef.current;

    if (!nextSnapshot) {
      return;
    }

    pendingSaveRef.current = null;
    isPersistingRef.current = true;
    setIsSavingDocument(true);

    try {
      const saveResult = await upsertExpenseDay({
        accessToken: session.accessToken,
        companyId: nextSnapshot.companyId,
        companyLogoBucketName: nextSnapshot.companyLogoBucketName,
        companyLogoObjectPath: nextSnapshot.companyLogoObjectPath,
        companyName: nextSnapshot.companyName,
        employeeName: nextSnapshot.employeeName,
        expenseDate,
        exportLanguage: nextSnapshot.exportLanguage,
        note: nextSnapshot.note,
        rows: nextSnapshot.rows,
      });

      setSaveError(null);
      setLastSavedAt(
        new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date()),
      );

      if (saveResult.didUpload) {
        skipNextAutosaveRef.current = true;
        setRows(saveResult.rows);
      }
    } catch (error) {
      if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
        void logout();
        return;
      }

      setSaveError(
        error instanceof Error ? error.message : "This expense day could not be saved.",
      );
    } finally {
      isPersistingRef.current = false;
      setIsSavingDocument(false);

      if (pendingSaveRef.current) {
        void flushPendingSave();
      }
    }
  });

  useEffect(() => {
    if (!hasLoadedDocumentRef.current) {
      return;
    }

    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    pendingSaveRef.current = {
      companyId: selectedCompanyId,
      companyLogoBucketName: selectedCompanyLogoBucketName,
      companyLogoObjectPath: selectedCompanyLogoObjectPath,
      companyName: selectedCompanyName,
      employeeName,
      exportLanguage,
      note,
      rows,
    };

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void flushPendingSave();
    }, 700);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [
    employeeName,
    exportLanguage,
    note,
    rows,
    selectedCompanyId,
    selectedCompanyLogoBucketName,
    selectedCompanyLogoObjectPath,
    selectedCompanyName,
  ]);

  const populatedRows = rows.filter(hasRowContent);
  const totalAmount = rows.reduce((sum, row) => sum + parseAmount(row.amount), 0);
  const totalReceipts = rows.reduce((sum, row) => sum + row.receipts.length, 0);
  const exportCopy = EXPORT_COPY[exportLanguage];
  const printableReceipts = populatedRows.flatMap((row) =>
    row.receipts.map((receipt, receiptIndex) => ({
      key: `${row.id}-${receipt.id}`,
      label: `${exportCopy.receiptLabel} - ${exportCopy.expenseLabel} ${String(row.id).padStart(2, "0")}${
        row.receipts.length > 1 ? `.${receiptIndex + 1}` : ""
      }`,
      receipt,
      row,
    })),
  );

  const updateRow = <K extends keyof ExpenseRow,>(
    rowId: number,
    key: K,
    value: ExpenseRow[K],
  ) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: value,
            }
          : row,
      ),
    );
  };

  const addRow = () => {
    startTransition(() => {
      setRows((currentRows) => {
        const nextId =
          currentRows.length === 0
            ? 1
            : Math.max(...currentRows.map((row) => row.id)) + 1;

        return [...currentRows, createEmptyRow(nextId)];
      });
    });
  };

  const removeRow = (rowId: number) => {
    startTransition(() => {
      setRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
    });
  };

  const toggleExpanded = (rowId: number) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              isExpanded: !row.isExpanded,
            }
          : row,
      ),
    );
  };

  const toggleReceiptPreview = (rowId: number) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              isReceiptPreviewOpen: !row.isReceiptPreviewOpen,
            }
          : row,
      ),
    );
  };

  const handleReceiptChange = async (rowId: number, files: FileList | null) => {
    let nextReceipts: ReceiptDraft[];

    try {
      nextReceipts = await toReceiptDrafts(rowId, files);
    } catch {
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              receipts: nextReceipts,
              isReceiptPreviewOpen: nextReceipts.length > 0,
            }
          : row,
      ),
    );
  };

  const handleCompanySelect = (value: string) => {
    if (value === EMPTY_COMPANY_VALUE) {
      setSelectedCompanyId("");
      return;
    }

    setSelectedCompanyId(value);
  };

  const handlePrint = () => {
    const printedAt = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());

    setLastPrintedAt(printedAt);
    window.print();
  };

  if (isLoadingDocument) {
    return (
      <div className="page-shell min-h-screen">
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:py-8">
          <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
            <CardContent className="px-6 py-12 text-center sm:px-10">
              <Badge className="rounded-full px-3 py-1" variant="secondary">
                Syncing
              </Badge>
              <p className="mt-5 font-serif text-3xl tracking-tight text-foreground">
                Loading this day from Supabase
              </p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Pulling the report, receipts, and company headers before the editor
                opens.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (documentError) {
    return (
      <div className="page-shell min-h-screen">
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:py-8">
          <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
            <CardContent className="px-6 py-12 text-center sm:px-10">
              <Badge className="rounded-full px-3 py-1" variant="secondary">
                Load failed
              </Badge>
              <p className="mt-5 font-serif text-3xl tracking-tight text-foreground">
                The editor could not reach Supabase
              </p>
              <p className="mt-3 text-sm leading-7 text-destructive">{documentError}</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button asChild className="rounded-full px-5" variant="outline">
                  <Link href="/dashboard">Back to dashboard</Link>
                </Button>
                <Button
                  className="rounded-full px-5"
                  type="button"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell min-h-screen">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="screen-only">
          <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
            <CardHeader className="gap-6 border-b border-border/60 px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className="rounded-full border-white/10 bg-white/5 px-4 py-1 text-[0.7rem] uppercase tracking-[0.28em] text-primary"
                      variant="outline"
                    >
                      Expense day
                    </Badge>
                    <Badge className="rounded-full px-3 py-1" variant="secondary">
                      {expenseDate}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
                      Single-day reimbursement sheet
                    </p>
                    <CardTitle className="font-serif text-4xl tracking-[-0.03em] sm:text-5xl">
                      {formatDisplayDate(expenseDate)}
                    </CardTitle>
                    <CardDescription className="max-w-3xl text-sm leading-7 sm:text-base">
                      Keep every row on this date, then export a cleaner company-branded
                      paper form with signature space and appended receipt pages.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <ThemeSettingsSheet userEmail={session.userEmail} />
                  <Button
                    className="rounded-full border-white/10 bg-background/70 px-4 shadow-none backdrop-blur-xl hover:bg-background/90"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={handlePrint}
                  >
                    <Printer className="size-4" />
                    Export / PDF
                  </Button>
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
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="grid gap-3 md:grid-cols-4">
                  <EditorMetric
                    label="Employee"
                    value={employeeName || deriveDisplayName(session.userEmail)}
                    icon={<UserRound className="size-4" />}
                  />
                  <EditorMetric
                    label="Rows"
                    value={`${rows.length}`}
                    icon={<FileText className="size-4" />}
                  />
                  <EditorMetric
                    label="Receipts"
                    value={`${totalReceipts}`}
                    icon={<Receipt className="size-4" />}
                  />
                  <EditorMetric
                    label="Total"
                    value={formatCurrency(totalAmount)}
                    icon={<CalendarDays className="size-4" />}
                  />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    asChild
                    className="rounded-full border-white/10 bg-background/70 px-4 shadow-none backdrop-blur-xl hover:bg-background/90"
                    size="sm"
                    variant="outline"
                  >
                    <Link href="/dashboard">Back to dashboard</Link>
                  </Button>
                  <Button className="rounded-full px-5" size="sm" type="button" onClick={addRow}>
                    <Plus className="size-4" />
                    Create expense
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <TopRouteTabs activeSection="expenses" />

          <main className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,22rem)]">
            <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
              <CardHeader className="gap-4 border-b border-border/60 px-5 py-5 sm:px-6 sm:py-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-2">
                    <Badge className="rounded-full px-3 py-1" variant="secondary">
                      Expense rows
                    </Badge>
                    <CardTitle className="font-serif text-3xl tracking-tight">
                      Daily line items
                    </CardTitle>
                    <CardDescription className="text-sm leading-7 sm:text-base">
                      Expand any row to adjust type, amount, remarks, and receipt images.
                    </CardDescription>
                  </div>

                  <Button className="rounded-full px-5" type="button" onClick={addRow}>
                    <Plus className="size-4" />
                    Add row
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
                {rows.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-background/60 px-5 py-12 text-center text-sm text-muted-foreground">
                    No expenses yet. Create the first row to begin the day sheet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rows.map((row) => (
                      <article
                        className="rounded-3xl border border-white/10 bg-background/65 p-4 sm:p-5"
                        key={row.id}
                      >
                        <button
                          className="flex w-full flex-col gap-4 text-left sm:flex-row sm:items-start sm:justify-between"
                          type="button"
                          onClick={() => toggleExpanded(row.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="rounded-full px-3 py-1">
                                {findExpenseTypeLabel(row.typeId)}
                              </Badge>
                              <Badge className="rounded-full px-3 py-1" variant="outline">
                                Expense {row.id}
                              </Badge>
                              {row.receipts.length > 0 ? (
                                <Badge className="rounded-full px-3 py-1" variant="outline">
                                  {row.receipts.length} receipt
                                  {row.receipts.length === 1 ? "" : "s"}
                                </Badge>
                              ) : null}
                            </div>

                            <p className="mt-4 text-sm leading-7 text-foreground sm:text-base">
                              {buildRemarkSummary(row.remark)}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-3 sm:justify-end">
                            <span className="text-base font-semibold text-foreground">
                              {row.amount.trim()
                                ? formatCurrency(parseAmount(row.amount))
                                : "THB 0.00"}
                            </span>
                            <span className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-background/80 text-muted-foreground">
                              {row.isExpanded ? (
                                <ChevronUp className="size-4" />
                              ) : (
                                <ChevronDown className="size-4" />
                              )}
                            </span>
                          </div>
                        </button>

                        {row.isExpanded ? (
                          <div className="mt-5 space-y-5 border-t border-border/60 pt-5">
                            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_11rem]">
                              <label className="block space-y-2">
                                <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                  Type
                                </span>
                                <Select
                                  value={row.typeId}
                                  onValueChange={(value) =>
                                    updateRow(row.id, "typeId", value)
                                  }
                                >
                                  <SelectTrigger className="h-11 w-full rounded-2xl border-white/10 bg-background/75 px-4">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-2xl border-white/10 bg-popover/95 backdrop-blur-xl">
                                    {EXPENSE_TYPES.map((expenseType) => (
                                      <SelectItem key={expenseType.id} value={expenseType.id}>
                                        {expenseType.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </label>

                              <label className="block space-y-2">
                                <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                  Amount (THB)
                                </span>
                                <Input
                                  className="h-11 rounded-2xl border-white/10 bg-background/75 px-4 text-right"
                                  min="0"
                                  placeholder="0.00"
                                  step="0.01"
                                  type="number"
                                  value={row.amount}
                                  onChange={(event) =>
                                    updateRow(row.id, "amount", event.target.value)
                                  }
                                />
                              </label>
                            </div>

                            <label className="block space-y-2">
                              <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                Remark
                              </span>
                              <Textarea
                                className="min-h-28 rounded-2xl border-white/10 bg-background/75 px-4 py-3"
                                placeholder="Where, why, who, route, or meeting context"
                                value={row.remark}
                                onChange={(event) =>
                                  updateRow(row.id, "remark", event.target.value)
                                }
                              />
                            </label>

                            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                              <Button
                                asChild
                                className="rounded-full border-white/10 bg-background/70 px-4 shadow-none hover:bg-background/85"
                                size="sm"
                                variant="outline"
                              >
                                <label className="cursor-pointer">
                                  <ImagePlus className="size-4" />
                                  Attach receipts
                                  <input
                                    className="hidden"
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(event) => {
                                      void handleReceiptChange(row.id, event.target.files);
                                    }}
                                  />
                                </label>
                              </Button>

                              {row.receipts.length > 0 ? (
                                <Button
                                  className="rounded-full px-4"
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() => toggleReceiptPreview(row.id)}
                                >
                                  {row.isReceiptPreviewOpen ? "Hide" : "Show"} receipts (
                                  {row.receipts.length})
                                </Button>
                              ) : null}

                              <Button
                                className="rounded-full px-4 text-destructive hover:text-destructive"
                                size="sm"
                                type="button"
                                variant="ghost"
                                onClick={() => removeRow(row.id)}
                              >
                                <Trash2 className="size-4" />
                                Remove
                              </Button>
                            </div>

                            {row.receipts.length > 0 && row.isReceiptPreviewOpen ? (
                              <ReceiptPreviewGrid receipts={row.receipts} />
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
              <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
                <CardHeader className="gap-3 border-b border-border/60 px-5 py-5">
                  <Badge className="rounded-full px-3 py-1" variant="secondary">
                    Export profile
                  </Badge>
                  <CardTitle className="font-serif text-3xl tracking-tight">
                    Company + print setup
                  </CardTitle>
                  <CardDescription className="text-sm leading-7">
                    These selections apply to the full day form, not each individual
                    expense row.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5 px-5 py-5">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">
                      Company on export
                    </span>
                    <Select
                      disabled={companies.length === 0}
                      value={selectedCompanyId || EMPTY_COMPANY_VALUE}
                      onValueChange={handleCompanySelect}
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-background/75 px-4">
                        <SelectValue placeholder="Select a saved company" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-white/10 bg-popover/95 backdrop-blur-xl">
                        <SelectItem value={EMPTY_COMPANY_VALUE}>No company selected</SelectItem>
                        {selectedCompanyId && !selectedCompany ? (
                          <SelectItem value={selectedCompanyId}>
                            {selectedCompanyName || "Saved company (unavailable)"}
                          </SelectItem>
                        ) : null}
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <div className="rounded-3xl border border-white/10 bg-background/65 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-background/85">
                        {selectedCompanyLogoUrl ? (
                          <Image
                            alt={selectedCompanyName || "Selected company logo"}
                            className="h-full w-full object-contain"
                            height={128}
                            src={selectedCompanyLogoUrl}
                            unoptimized
                            width={128}
                          />
                        ) : (
                          <Building2 className="size-6 text-muted-foreground" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                          Selected company
                        </p>
                        <p className="mt-2 truncate text-sm font-medium text-foreground">
                          {selectedCompanyName || "No company selected yet"}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          This name and logo appear in the exported header.
                        </p>
                      </div>
                    </div>
                  </div>

                  {companies.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-background/60 px-4 py-4 text-sm text-muted-foreground">
                      Save a company in the Company Headers tab to print a branded form
                      header.
                    </div>
                  ) : null}

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">
                      Export language
                    </span>
                    <Select
                      value={exportLanguage}
                      onValueChange={(value) =>
                        setExportLanguage(value === "th" ? "th" : "en")
                      }
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-background/75 px-4">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl border-white/10 bg-popover/95 backdrop-blur-xl">
                        <SelectItem value="en">English export</SelectItem>
                        <SelectItem value="th">Thai export</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">Employee name</span>
                    <Input
                      className="h-11 rounded-2xl border-white/10 bg-background/75 px-4"
                      placeholder="Who is submitting this date"
                      type="text"
                      value={employeeName}
                      onChange={(event) => setEmployeeName(event.target.value)}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">Note</span>
                    <Textarea
                      className="min-h-28 rounded-2xl border-white/10 bg-background/75 px-4 py-3"
                      placeholder="Optional note for approval, department, or accounting"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                </CardContent>
              </Card>

              <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
                <CardHeader className="gap-3 border-b border-border/60 px-5 py-5">
                  <Badge className="rounded-full px-3 py-1" variant="secondary">
                    Summary
                  </Badge>
                  <CardTitle className="font-serif text-3xl tracking-tight">
                    {formatCurrency(totalAmount)}
                  </CardTitle>
                  <CardDescription className="text-sm leading-7">
                    {populatedRows.length} filled expense
                    {populatedRows.length === 1 ? "" : "s"} with {totalReceipts} receipt
                    {totalReceipts === 1 ? "" : "s"} attached.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 px-5 py-5">
                  <div className="rounded-3xl border border-white/10 bg-background/65 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                      Supabase sync
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {isSavingDocument
                        ? "Saving changes..."
                        : lastSavedAt
                          ? `Last saved ${lastSavedAt}`
                          : "Waiting for your first edit"}
                    </p>
                    {saveError ? (
                      <p className="mt-2 text-sm text-destructive">{saveError}</p>
                    ) : null}
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-background/65 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                      Last export
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {lastPrintedAt ?? "Not exported yet"}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-background/65 p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-primary">
                        <Globe2 className="size-4" />
                      </span>
                      <p className="text-sm leading-7 text-foreground">
                        The print layout uses the selected language, reserves signature
                        lines, and adds each receipt image after the main form.
                      </p>
                    </div>
                  </div>

                  <Button className="h-11 w-full rounded-2xl" type="button" onClick={handlePrint}>
                    <Printer className="size-4" />
                    Export this day sheet
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-border/60 py-0">
                <CardContent className="px-5 py-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                      <NotebookPen className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">Supabase-backed day</p>
                      <p className="text-sm text-muted-foreground">
                        Database rows + Storage assets
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </section>

        <section className="print-only print-card print-sheet rounded-none bg-white p-8 text-black">
          <div className="rounded-[1.75rem] border border-black/20 p-6">
            <div className="flex items-start gap-5 border-b border-black/15 pb-5">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[1.5rem] border border-black/10 bg-black/[0.02]">
                {selectedCompanyLogoUrl ? (
                  <Image
                    alt={selectedCompanyName || exportCopy.companyPending}
                    className="h-full w-full object-contain"
                    height={192}
                    src={selectedCompanyLogoUrl}
                    unoptimized
                    width={192}
                  />
                ) : (
                  <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-black/45">
                    Logo
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-black/45">
                  {exportCopy.companyCaption}
                </p>
                <h2 className="mt-2 font-serif text-2xl leading-tight">
                  {selectedCompanyName || exportCopy.companyPending}
                </h2>
                <p className="mt-2 text-sm text-black/65">{exportCopy.formSubtitle}</p>
                <p className="mt-3 text-lg font-semibold">{exportCopy.formTitle}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <InfoLine
                label={exportCopy.date}
                value={formatExportDate(expenseDate, exportLanguage)}
              />
              <InfoLine
                label={exportCopy.employee}
                value={employeeName || deriveDisplayName(session.userEmail)}
              />
            </div>

            <div className="mt-4">
              <InfoLine label={exportCopy.note} value={note || exportCopy.noteFallback} />
            </div>

            {populatedRows.length === 0 ? (
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-black/20 px-4 py-5 text-sm text-black/60">
                {exportCopy.noExpenses}
              </div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-black/20">
                <div className="grid grid-cols-[0.8fr_minmax(0,4fr)_1.3fr] gap-4 bg-black px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-white">
                  <span>{exportCopy.line}</span>
                  <span>{exportCopy.details}</span>
                  <span className="text-right">{exportCopy.amount}</span>
                </div>

                <div className="divide-y divide-black/10">
                  {populatedRows.map((row) => (
                    <div
                      className="grid grid-cols-[0.8fr_minmax(0,4fr)_1.3fr] gap-4 px-4 py-4 text-sm"
                      key={row.id}
                    >
                      <span>{row.id}</span>
                      <div>
                        <p className="font-medium">
                          {formatExportExpenseTypeLabel(row.typeId, exportLanguage)}
                        </p>
                        <p className="mt-1 text-xs leading-6 text-black/60">
                          {row.remark || exportCopy.emptyRemark}
                        </p>
                      </div>
                      <span className="text-right">
                        {row.amount.trim()
                          ? formatPrintAmount(parseAmount(row.amount), exportLanguage)
                          : "-"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end rounded-[1.25rem] bg-black/[0.04] px-4 py-3 text-sm">
              <span className="font-medium">{exportCopy.total}:</span>
              <span className="ml-3 text-base font-semibold">
                {formatPrintAmount(totalAmount, exportLanguage)}
              </span>
            </div>

            <div className="mt-10 grid gap-6 text-sm md:grid-cols-3">
              {exportCopy.signatures.map((label) => (
                <div className="text-center" key={label}>
                  <p className="font-medium">{exportCopy.signatureHint}</p>
                  <div className="mt-8 border-b border-black/70" />
                  <p className="mt-3 text-black/75">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {printableReceipts.map((entry) => (
          <section
            className="print-only print-card print-sheet mt-4 rounded-none bg-white p-8 text-black"
            key={entry.key}
            style={{ breakBefore: "page" }}
          >
            <div className="rounded-[1.75rem] border border-black/20 p-6">
              <div className="border-b border-black/15 pb-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-black/45">
                  {entry.label}
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {formatExportExpenseTypeLabel(entry.row.typeId, exportLanguage)}
                </p>
                <p className="mt-1 text-sm text-black/65">
                  {entry.row.remark || exportCopy.emptyRemark}
                </p>
              </div>

              <div className="mt-6 flex min-h-[28rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-black/10 bg-black/[0.02] p-4">
                <Image
                  alt={entry.label}
                  className="h-auto max-h-[52rem] w-full object-contain"
                  height={1400}
                  src={entry.receipt.previewUrl}
                  unoptimized
                  width={1000}
                />
              </div>

              <p className="mt-4 text-sm text-black/55">{entry.receipt.name}</p>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function formatExportDate(value: string, language: ExportLanguage) {
  const parsedDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-GB", {
    dateStyle: "long",
  }).format(parsedDate);
}

function formatExportExpenseTypeLabel(typeId: string, language: ExportLanguage) {
  if (language === "th") {
    return THAI_EXPENSE_TYPE_LABELS[typeId] ?? findExpenseTypeLabel(typeId);
  }

  return findExpenseTypeLabel(typeId);
}

function formatPrintAmount(amount: number, language: ExportLanguage) {
  const numericAmount = Number.isFinite(amount) ? amount : 0;
  const formattedNumber = new Intl.NumberFormat(language === "th" ? "th-TH" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericAmount);

  return language === "th" ? `${formattedNumber} บาท` : `${formattedNumber} THB`;
}

function EditorMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-background/65 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <p className="mt-3 truncate text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-black/10 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-black/45">
        {label}
      </p>
      <p className="mt-2 text-sm">{value}</p>
    </div>
  );
}

function ReceiptPreviewGrid({
  receipts,
}: {
  receipts: ReceiptDraft[];
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-background/60 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {receipts.map((receipt) => (
          <div
            className="flex items-center gap-3 rounded-3xl border border-white/10 bg-background/80 p-3"
            key={receipt.id}
          >
            <div
              className="h-16 w-16 shrink-0 rounded-2xl bg-cover bg-center"
              style={{
                backgroundImage: `url("${receipt.previewUrl}")`,
              }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{receipt.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{receipt.sizeLabel}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
