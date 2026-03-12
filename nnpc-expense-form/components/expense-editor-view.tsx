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
  CircleAlert,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CloudCheck,
  CloudUpload,
  FileText,
  Globe2,
  Hash,
  ImagePlus,
  LoaderCircle,
  LogOut,
  NotebookPen,
  Plus,
  Printer,
  Receipt,
  Sparkles,
  Trash2,
  UserRound,
  X,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TopRouteTabs } from "@/components/top-route-tabs";
import {
  readCompaniesCache,
  readExpenseDayCache,
  upsertExpenseSummaryCache,
  writeCompaniesCache,
  writeExpenseDayCache,
} from "@/lib/browser-cache";
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
  type ExpenseDayDocument,
  getExpenseDay,
  upsertExpenseDay,
} from "../lib/report-data";
import { buildPublicStorageUrl } from "../lib/supabase-api";

const EMPTY_COMPANY_VALUE = "__none__";
const PRIMARY_EXPORT_ROW_LIMIT = 6;
const RECEIPTS_PER_PAGE = 4;
const IMAGE_PRELOAD_TIMEOUT_MS = 12_000;
const PRINT_TABLE_GRID_TEMPLATE = "1.6fr 1.75fr 2.95fr 1.25fr";

const EXPORT_COPY: Record<
  ExportLanguage,
  {
    formTitle: string;
    formSubtitle: string;
    companyCaption: string;
    companyPending: string;
    date: string;
    employee: string;
    reference: string;
    note: string;
    line: string;
    expenseType: string;
    expenseNote: string;
    amount: string;
    total: string;
    noExpenses: string;
    emptyRemark: string;
    noteFallback: string;
    receiptLabel: string;
    expenseLabel: string;
    receiptsSheetTitle: string;
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
    reference: "Reference",
    note: "Note",
    line: "No.",
    expenseType: "Expense type",
    expenseNote: "Expense note",
    amount: "Amount",
    total: "Total amount",
    noExpenses: "No expenses added for this day.",
    emptyRemark: "No extra remark",
    noteFallback: "No additional note.",
    receiptLabel: "Receipt Image",
    expenseLabel: "Expense",
    receiptsSheetTitle: "Receipt attachments",
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
    reference: "เลขอ้างอิง",
    note: "หมายเหตุ",
    line: "ลำดับ",
    expenseType: "ประเภทค่าใช้จ่าย",
    expenseNote: "รายละเอียด",
    amount: "จำนวนเงิน",
    total: "รวมจำนวนเงิน",
    noExpenses: "ยังไม่มีรายการค่าใช้จ่ายสำหรับวันนี้",
    emptyRemark: "ไม่มีรายละเอียดเพิ่มเติม",
    noteFallback: "ไม่มีหมายเหตุเพิ่มเติม",
    receiptLabel: "รูปใบเสร็จ",
    expenseLabel: "รายการ",
    receiptsSheetTitle: "รูปใบเสร็จแนบ",
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

type PendingRemoval =
  | {
      kind: "receipt";
      receiptId: string;
      receiptName: string;
      rowId: number;
      rowReference: string;
    }
  | {
      kind: "row";
      rowId: number;
      rowReference: string;
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
      id:
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${rowId}-${Date.now()}-${index}-${file.name}`,
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

      reject(new Error("This photo could not be prepared."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("This photo could not be prepared."));
    };

    reader.readAsDataURL(file);
  });
}

function getFriendlyEditorError(
  error: unknown,
  action: "load" | "save" | "receipt" | "print",
) {
  const message = error instanceof Error ? error.message : "";

  if (/session expired/i.test(message)) {
    return "Your session ended. Please sign in again.";
  }

  if (/Missing Supabase URL|publishable key/i.test(message)) {
    return "This page is not fully set up yet. Please ask the app owner to finish the setup.";
  }

  if (/Failed to fetch|NetworkError|network request|Load failed|fetch/i.test(message)) {
    if (action === "load") {
      return "We couldn't open this expense page right now. Please check your internet connection and try again.";
    }

    if (action === "print") {
      return "We couldn't prepare the receipt photos for printing. Please try again in a moment.";
    }

    return "We couldn't save your latest changes right now. Please check your internet connection and try again.";
  }

  if (/permission|forbidden|unauthorized|row-level security/i.test(message)) {
    return "You don't have access to do that right now. Please sign in again and try once more.";
  }

  if (action === "receipt") {
    return "One of the receipt photos could not be added. Please try a different image.";
  }

  if (action === "load") {
    return "We couldn't open this expense page right now. Please try again.";
  }

  if (action === "print") {
    return "We couldn't get the receipt photos ready for export. Please try again.";
  }

  return "We couldn't save your latest changes. Please try again.";
}

function preloadImageUrl(url: string) {
  return new Promise<boolean>((resolve) => {
    const image = new window.Image();
    const timeoutId = window.setTimeout(() => resolve(false), IMAGE_PRELOAD_TIMEOUT_MS);

    const finish = (didLoad: boolean) => {
      window.clearTimeout(timeoutId);
      resolve(didLoad);
    };

    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.decoding = "async";
    image.src = url;

    if (image.complete) {
      finish(image.naturalWidth > 0);
    }
  });
}

async function preloadPrintableAssets(urls: string[]) {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));

  if (uniqueUrls.length === 0) {
    return true;
  }

  const results = await Promise.all(uniqueUrls.map((url) => preloadImageUrl(url)));

  return results.every(Boolean);
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
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
  const cacheUserKey = session.userEmail;
  const [employeeName, setEmployeeName] = useState(defaultEmployeeName);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [loadedCompanyId, setLoadedCompanyId] = useState("");
  const [loadedCompanyName, setLoadedCompanyName] = useState("");
  const [loadedCompanyLogoBucketName, setLoadedCompanyLogoBucketName] = useState("");
  const [loadedCompanyLogoObjectPath, setLoadedCompanyLogoObjectPath] = useState("");
  const [loadedCompanyLogoUrl, setLoadedCompanyLogoUrl] = useState("");
  const [expenseCode, setExpenseCode] = useState("");
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
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
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

  const applyLoadedDocument = useEffectEvent((
    existingReport: ExpenseDayDocument | null,
    nextCompanies: CompanyRecord[],
  ) => {
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
      setExpenseCode("");
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
      setExpenseCode(existingReport.expenseCode);
      setExportLanguage(existingReport.exportLanguage);
      setNote(existingReport.note);
      setRows(buildRowsFromLoadedReport(existingReport.rows));
    }

    skipNextAutosaveRef.current = true;
    hasLoadedDocumentRef.current = true;
  });

  useEffect(() => {
    let isActive = true;

    const loadDocument = async () => {
      const cachedCompanies = readCompaniesCache(cacheUserKey);
      const cachedExpenseDay = readExpenseDayCache(cacheUserKey, expenseDate);
      const [nextCompanies, existingReport] = await Promise.all([
        cachedCompanies
          ? Promise.resolve(cachedCompanies)
          : listUserCompanies(session.accessToken),
        cachedExpenseDay
          ? Promise.resolve(cachedExpenseDay)
          : getExpenseDay(session.accessToken, expenseDate),
      ]);

      if (!isActive) {
        return;
      }

      if (!cachedCompanies) {
        writeCompaniesCache(cacheUserKey, nextCompanies);
      }

      if (existingReport && !cachedExpenseDay) {
        writeExpenseDayCache(cacheUserKey, expenseDate, existingReport);
      }

      applyLoadedDocument(existingReport, nextCompanies);
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
          getFriendlyEditorError(error, "load"),
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
  }, [cacheUserKey, defaultEmployeeName, expenseDate, logout, session.accessToken]);

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
      setExpenseCode(saveResult.expenseCode);
      setLastSavedAt(
        new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date()),
      );

      const persistedRows = saveResult.rows
        .filter(hasRowContent)
        .map((row) => ({
          ...row,
          isExpanded: false,
          isReceiptPreviewOpen: false,
        }));
      const cachedCompanyLogoUrl =
        nextSnapshot.companyLogoBucketName && nextSnapshot.companyLogoObjectPath
          ? buildPublicStorageUrl(
              nextSnapshot.companyLogoBucketName,
              nextSnapshot.companyLogoObjectPath,
            )
          : "";

      writeExpenseDayCache(cacheUserKey, expenseDate, {
        companyId: nextSnapshot.companyId,
        companyLogoBucketName: nextSnapshot.companyLogoBucketName,
        companyLogoObjectPath: nextSnapshot.companyLogoObjectPath,
        companyLogoUrl: cachedCompanyLogoUrl,
        companyName: nextSnapshot.companyName,
        employeeName: nextSnapshot.employeeName,
        exportLanguage: nextSnapshot.exportLanguage,
        note: nextSnapshot.note,
        expenseCode: saveResult.expenseCode,
        reportId: saveResult.reportId,
        rows: persistedRows,
      });
      upsertExpenseSummaryCache(cacheUserKey, {
        date: expenseDate,
        expenseCode: saveResult.expenseCode,
        totalAmount: persistedRows.reduce((sum, row) => sum + parseAmount(row.amount), 0),
      });

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
        getFriendlyEditorError(error, "save"),
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

  const rowNumberById = new Map(rows.map((row, index) => [row.id, index + 1]));
  const populatedRows = rows.filter(hasRowContent);
  const populatedRowsWithLineNumbers = populatedRows.map((row, index) => ({
    lineNumber: index + 1,
    row,
  }));
  const totalAmount = rows.reduce((sum, row) => sum + parseAmount(row.amount), 0);
  const totalReceipts = rows.reduce((sum, row) => sum + row.receipts.length, 0);
  const exportCopy = EXPORT_COPY[exportLanguage];
  const printableFormRows = populatedRowsWithLineNumbers.slice(0, PRIMARY_EXPORT_ROW_LIMIT);
  const overflowRows = populatedRowsWithLineNumbers.slice(PRIMARY_EXPORT_ROW_LIMIT);
  const overflowAmount = overflowRows.reduce(
    (sum, entry) => sum + parseAmount(entry.row.amount),
    0,
  );
  const printableReceipts = populatedRowsWithLineNumbers.flatMap(({ lineNumber, row }) =>
    row.receipts.map((receipt, receiptIndex) => ({
      key: `${row.id}-${receipt.id}`,
      label: `${exportCopy.receiptLabel} - ${formatExpenseLineReference(expenseCode, lineNumber)}${
        row.receipts.length > 1 ? `.${receiptIndex + 1}` : ""
      }`,
      lineNumber,
      receipt,
      row,
    })),
  );
  const receiptPages = chunkEntries(printableReceipts, RECEIPTS_PER_PAGE);
  const printableAssetUrls = [
    selectedCompanyLogoUrl,
    ...printableReceipts.map((entry) => entry.receipt.previewUrl),
  ].filter(Boolean);
  const editorStatus = saveError
    ? {
        description: saveError,
        icon: <CircleAlert className="size-4" />,
        label: "Needs attention",
        tone:
          "border-destructive/18 bg-[linear-gradient(135deg,rgba(239,68,68,0.16),rgba(239,68,68,0.05))] text-destructive",
      }
    : isSavingDocument
      ? {
          description: "You can keep working while we update this page in the background.",
          icon: <CloudUpload className="size-4 animate-pulse" />,
          label: "Saving your latest changes",
          tone:
            "border-primary/18 bg-[linear-gradient(135deg,rgba(34,197,94,0.16),rgba(34,197,94,0.05))] text-primary",
        }
      : lastSavedAt
        ? {
            description: `Last updated ${lastSavedAt}`,
            icon: <CloudCheck className="size-4" />,
            label: "All changes saved automatically",
            tone:
              "border-primary/15 bg-[linear-gradient(135deg,rgba(34,197,94,0.12),rgba(34,197,94,0.04))] text-primary",
          }
        : {
            description: "Your changes will save automatically while you work.",
            icon: <Sparkles className="size-4" />,
            label: "Ready to start",
            tone:
              "border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] text-primary",
          };

  const updateRow = <K extends keyof ExpenseRow,>(
    rowId: number,
    key: K,
    value: ExpenseRow[K],
  ) => {
    setPrintError(null);
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
    setPrintError(null);
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
    setPrintError(null);
    startTransition(() => {
      setRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
    });
  };

  const removeReceipt = (rowId: number, receiptId: string) => {
    setPrintError(null);
    startTransition(() => {
      setRows((currentRows) =>
        currentRows.map((row) => {
          if (row.id !== rowId) {
            return row;
          }

          const nextReceipts = row.receipts.filter((receipt) => receipt.id !== receiptId);

          return {
            ...row,
            receipts: nextReceipts,
            isReceiptPreviewOpen: nextReceipts.length > 0 && row.isReceiptPreviewOpen,
          };
        }),
      );
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
    if (!files || files.length === 0) {
      return;
    }

    let nextReceipts: ReceiptDraft[];

    try {
      nextReceipts = await toReceiptDrafts(rowId, files);
      setSaveError(null);
      setPrintError(null);
    } catch (error) {
      setSaveError(getFriendlyEditorError(error, "receipt"));
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              receipts: [...row.receipts, ...nextReceipts],
              isReceiptPreviewOpen: true,
            }
          : row,
      ),
    );
  };

  const handleCompanySelect = (value: string) => {
    setPrintError(null);

    if (value === EMPTY_COMPANY_VALUE) {
      setSelectedCompanyId("");
      return;
    }

    setSelectedCompanyId(value);
  };

  const requestRowRemoval = (rowId: number) => {
    const rowNumber = rowNumberById.get(rowId) ?? rowId;

    setPendingRemoval({
      kind: "row",
      rowId,
      rowReference: formatExpenseLineReference(expenseCode, rowNumber),
    });
  };

  const requestReceiptRemoval = (rowId: number, receipt: ReceiptDraft) => {
    const rowNumber = rowNumberById.get(rowId) ?? rowId;

    setPendingRemoval({
      kind: "receipt",
      receiptId: receipt.id,
      receiptName: receipt.name,
      rowId,
      rowReference: formatExpenseLineReference(expenseCode, rowNumber),
    });
  };

  const confirmPendingRemoval = () => {
    if (!pendingRemoval) {
      return;
    }

    if (pendingRemoval.kind === "row") {
      removeRow(pendingRemoval.rowId);
    } else {
      removeReceipt(pendingRemoval.rowId, pendingRemoval.receiptId);
    }

    setPendingRemoval(null);
  };

  const handlePrint = async () => {
    if (isPreparingPrint) {
      return;
    }

    setPrintError(null);
    setIsPreparingPrint(true);

    const printedAt = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());

    try {
      const areAssetsReady = await preloadPrintableAssets(printableAssetUrls);

      if (!areAssetsReady) {
        throw new Error("Printable assets were not ready in time.");
      }

      await waitForNextFrame();
      setLastPrintedAt(printedAt);
      window.print();
    } catch (error) {
      setPrintError(getFriendlyEditorError(error, "print"));
    } finally {
      setIsPreparingPrint(false);
    }
  };

  if (isLoadingDocument) {
    return (
      <div className="page-shell min-h-screen">
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:py-8">
          <LoadingExpenseDayState />
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
                We hit a snag
              </Badge>
              <div className="mx-auto mt-5 flex size-16 items-center justify-center rounded-full border border-destructive/20 bg-destructive/8 text-destructive">
                <CircleAlert className="size-7" />
              </div>
              <p className="mt-5 font-serif text-3xl tracking-tight text-foreground">
                This expense page could not be opened
              </p>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
                {documentError}
              </p>
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
                      Daily expenses
                    </Badge>
                    <Badge className="rounded-full px-3 py-1" variant="secondary">
                      {expenseDate}
                    </Badge>
                    <Badge className="rounded-full px-3 py-1" variant="outline">
                      {expenseCode || "Reference pending"}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
                      Simple reimbursement page
                    </p>
                    <CardTitle className="font-serif text-3xl tracking-[-0.03em] sm:text-5xl">
                      {formatDisplayDate(expenseDate)}
                    </CardTitle>
                    <CardDescription className="max-w-3xl text-sm leading-7 sm:text-base">
                      Add each expense for this day, attach one or more receipt photos,
                      then print a clean form with extra receipt pages.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <ThemeSettingsSheet userEmail={session.userEmail} />
                  <Button
                    className="rounded-full border-white/10 bg-background/70 px-4 shadow-none backdrop-blur-xl hover:bg-background/90"
                    disabled={isPreparingPrint}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void handlePrint();
                    }}
                  >
                    {isPreparingPrint ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Printer className="size-4" />
                    )}
                    {isPreparingPrint ? "Preparing export..." : "Print or save PDF"}
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
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <EditorMetric
                    label="Reference"
                    value={expenseCode || "Pending first save"}
                    icon={<Hash className="size-4" />}
                  />
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
                      Expand any row to update the details, attach more than one receipt
                      photo, or remove a photo before export.
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
                  <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-background/60 px-5 py-12 text-center">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                      <Receipt className="size-6" />
                    </div>
                    <p className="mt-5 font-serif text-2xl text-foreground">
                      No expense lines yet
                    </p>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">
                      Add your first line item to record the amount, a short note, and
                      any receipt photos for this date.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-[1.6rem] border border-white/10 bg-background/55 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Badge className="rounded-full px-3 py-1" variant="outline">
                          Adds multiple receipt photos
                        </Badge>
                        <Badge className="rounded-full px-3 py-1" variant="outline">
                          Saves automatically
                        </Badge>
                        <Badge className="rounded-full px-3 py-1" variant="outline">
                          Prints extra receipt pages
                        </Badge>
                      </div>
                    </div>

                    {rows.map((row) => {
                      const rowNumber = rowNumberById.get(row.id) ?? row.id;
                      const rowReference = formatExpenseLineReference(expenseCode, rowNumber);

                      return (
                        <article
                          className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_48px_-34px_rgba(15,23,42,0.55)]"
                          key={row.id}
                        >
                          <button
                            className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-start sm:justify-between"
                            type="button"
                            onClick={() => toggleExpanded(row.id)}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className="rounded-full px-3 py-1">
                                  {findExpenseTypeLabel(row.typeId)}
                                </Badge>
                                <Badge className="rounded-full px-3 py-1" variant="outline">
                                  {rowReference}
                                </Badge>
                                {row.receipts.length > 0 ? (
                                  <Badge className="rounded-full px-3 py-1" variant="outline">
                                    {row.receipts.length} photo
                                    {row.receipts.length === 1 ? "" : "s"}
                                  </Badge>
                                ) : null}
                              </div>

                              <p className="mt-3 text-sm leading-6 text-foreground sm:text-base">
                                {row.remark.trim()
                                  ? buildRemarkSummary(row.remark)
                                  : "Add a short note so everyone understands what this expense was for."}
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
                            <div className="mt-4 space-y-4 border-t border-border/60 pt-4">
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
                                  className="min-h-24 rounded-2xl border-white/10 bg-background/75 px-4 py-3"
                                  placeholder="What was this expense for?"
                                  value={row.remark}
                                  onChange={(event) =>
                                    updateRow(row.id, "remark", event.target.value)
                                  }
                                />
                              </label>

                              <div className="rounded-[1.45rem] border border-white/10 bg-background/55 p-3">
                                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                                  <Button
                                    asChild
                                    className="rounded-full border-white/10 bg-background/70 px-4 shadow-none hover:bg-background/85"
                                    size="sm"
                                    variant="outline"
                                  >
                                    <label className="cursor-pointer">
                                      <ImagePlus className="size-4" />
                                      {row.receipts.length > 0
                                        ? "Add more receipt photos"
                                        : "Add receipt photos"}
                                      <input
                                        className="hidden"
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={(event) => {
                                          void handleReceiptChange(row.id, event.target.files);
                                          event.target.value = "";
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
                                      {row.isReceiptPreviewOpen ? "Hide photos" : "Show photos"} (
                                      {row.receipts.length})
                                    </Button>
                                  ) : null}

                                  <Button
                                    className="rounded-full px-4 text-destructive hover:text-destructive"
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                    onClick={() => requestRowRemoval(row.id)}
                                  >
                                    <Trash2 className="size-4" />
                                    Remove row
                                  </Button>
                                </div>

                                <p className="mt-3 text-sm text-muted-foreground">
                                  You can keep more than one photo on the same expense line.
                                </p>
                              </div>

                              {row.receipts.length > 0 && row.isReceiptPreviewOpen ? (
                                <ReceiptPreviewGrid
                                  receipts={row.receipts}
                                  rowReference={rowReference}
                                  onRemoveReceipt={(receipt) =>
                                    requestReceiptRemoval(row.id, receipt)
                                  }
                                />
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
              <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
                <CardHeader className="gap-3 border-b border-border/60 px-5 py-5">
                  <Badge className="rounded-full px-3 py-1" variant="secondary">
                    Print setup
                  </Badge>
                  <CardTitle className="font-serif text-2xl tracking-tight sm:text-3xl">
                    Company and form details
                  </CardTitle>
                  <CardDescription className="text-sm leading-7">
                    These details appear across the full printed form.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5 px-5 py-5">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">
                      Company for this form
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
                          Company on the form
                        </p>
                        <p className="mt-2 truncate text-sm font-medium text-foreground">
                          {selectedCompanyName || "No company selected yet"}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          The name and logo show in the printed header.
                        </p>
                      </div>
                    </div>
                  </div>

                  {companies.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-background/60 px-4 py-4 text-sm text-muted-foreground">
                      Add a company in Company Headers if you want the printed form to
                      include a branded header.
                    </div>
                  ) : null}

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">
                      Export language
                    </span>
                    <Select
                      value={exportLanguage}
                      onValueChange={(value) => {
                        setPrintError(null);
                        setExportLanguage(value === "th" ? "th" : "en");
                      }}
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
                      placeholder="Who is submitting this form?"
                      type="text"
                      value={employeeName}
                      onChange={(event) => {
                        setPrintError(null);
                        setEmployeeName(event.target.value);
                      }}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">Note</span>
                    <Textarea
                      className="min-h-28 rounded-2xl border-white/10 bg-background/75 px-4 py-3"
                      placeholder="Optional note for approval or context"
                      value={note}
                      onChange={(event) => {
                        setPrintError(null);
                        setNote(event.target.value);
                      }}
                    />
                  </label>
                </CardContent>
              </Card>

              <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
                <CardHeader className="gap-3 border-b border-border/60 px-5 py-5">
                  <Badge className="rounded-full px-3 py-1" variant="secondary">
                    Overview
                  </Badge>
                  <CardTitle className="font-serif text-2xl tracking-tight sm:text-3xl">
                    {formatCurrency(totalAmount)}
                  </CardTitle>
                  <CardDescription className="text-sm leading-7">
                    {populatedRows.length} filled expense line
                    {populatedRows.length === 1 ? "" : "s"} with {totalReceipts} receipt
                    photo{totalReceipts === 1 ? "" : "s"} attached.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 px-5 py-5">
                  <div className={`rounded-3xl border p-4 ${editorStatus.tone}`}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5">{editorStatus.icon}</span>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.24em] opacity-80">
                          Page status
                        </p>
                        <p className="mt-2 text-sm font-medium text-foreground">
                          {editorStatus.label}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-foreground/80">
                          {editorStatus.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-background/65 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                      Print status
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {isPreparingPrint
                        ? "Preparing your receipt photos for print..."
                        : lastPrintedAt
                          ? `Last prepared ${lastPrintedAt}`
                          : "Not printed yet"}
                    </p>
                    {printError ? (
                      <p className="mt-2 text-sm leading-6 text-destructive">{printError}</p>
                    ) : null}
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-background/65 p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-primary">
                        <Globe2 className="size-4" />
                      </span>
                      <p className="text-sm leading-7 text-foreground">
                        The printed form stays on one signature page, then adds up to four
                        receipt photos on each extra page.
                      </p>
                    </div>
                  </div>

                  <Button
                    className="h-11 w-full rounded-2xl"
                    disabled={isPreparingPrint}
                    type="button"
                    onClick={() => {
                      void handlePrint();
                    }}
                  >
                    {isPreparingPrint ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Printer className="size-4" />
                    )}
                    {isPreparingPrint ? "Preparing your export..." : "Print this day sheet"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-border/60 bg-background/65 py-0">
                <CardContent className="px-5 py-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                      <NotebookPen className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Tip for a cleaner printout
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Keep each note short and clear so the form stays easy to review.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </section>

        <section className="print-only print-card print-sheet rounded-none bg-white p-3 text-black">
          <div className="p-0">
            <div className="flex items-start gap-3 border-b border-black/25 pb-3">
              <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-[0.85rem]">
                {selectedCompanyLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- eager loading keeps the logo available during print export.
                  <img
                    alt={selectedCompanyName || exportCopy.companyPending}
                    className="h-full w-full object-contain"
                    decoding="sync"
                    loading="eager"
                    src={selectedCompanyLogoUrl}
                  />
                ) : (
                  <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-black/45">
                    Logo
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/55">
                  {exportCopy.companyCaption}
                </p>
                <h2 className="mt-1 line-clamp-2 font-serif text-[1.22rem] leading-tight">
                  {selectedCompanyName || exportCopy.companyPending}
                </h2>
                <p className="mt-1 text-[12px] text-black/65">{exportCopy.formSubtitle}</p>
                <p className="mt-1.5 text-[14px] font-semibold">{exportCopy.formTitle}</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <InfoLine
                label={exportCopy.date}
                value={formatExportDate(expenseDate, exportLanguage)}
              />
              <InfoLine
                label={exportCopy.employee}
                value={employeeName || deriveDisplayName(session.userEmail)}
              />
              <InfoLine
                label={exportCopy.reference}
                value={expenseCode || "Pending first save"}
              />
            </div>

            <div className="mt-2.5 border-b border-black/15 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/55">
                {exportCopy.note}
              </p>
              <p className="mt-1 line-clamp-2 text-[12px] leading-5">
                {note || exportCopy.noteFallback}
              </p>
            </div>

            {populatedRows.length === 0 ? (
              <div className="mt-3 px-1 py-2 text-sm text-black/60">
                {exportCopy.noExpenses}
              </div>
            ) : (
              <div className="mt-3 overflow-hidden border border-black/40">
                <div
                  className="grid bg-black/[0.035] text-[9px] font-semibold uppercase tracking-[0.12em] text-black/85"
                  style={{ gridTemplateColumns: PRINT_TABLE_GRID_TEMPLATE }}
                >
                  <div className="border-r border-b border-black/35 px-2 py-1.5">
                    {exportCopy.line}
                  </div>
                  <div className="border-r border-b border-black/35 px-2 py-1.5">
                    {exportCopy.expenseType}
                  </div>
                  <div className="border-r border-b border-black/35 px-2 py-1.5">
                    {exportCopy.expenseNote}
                  </div>
                  <div className="border-b border-black/35 px-2 py-1.5 text-right">
                    {exportCopy.amount}
                  </div>
                </div>

                {printableFormRows.map(({ lineNumber, row }) => (
                  <div
                    className="grid text-[11px] text-black"
                    key={row.id}
                    style={{ gridTemplateColumns: PRINT_TABLE_GRID_TEMPLATE }}
                  >
                    <div className="border-r border-b border-black/25 px-2 py-2 text-[8px] font-semibold leading-[0.95rem] [overflow-wrap:anywhere]">
                      {formatExpenseLineReference(expenseCode, lineNumber)}
                    </div>
                    <div className="border-r border-b border-black/25 px-2 py-2">
                      <p className="line-clamp-2 font-medium leading-[1.15rem]">
                        {formatExportExpenseTypeLabel(row.typeId, exportLanguage)}
                      </p>
                    </div>
                    <div className="border-r border-b border-black/25 px-2 py-2">
                      <p className="line-clamp-2 leading-[1.15rem] text-black/78">
                        {row.remark || exportCopy.emptyRemark}
                      </p>
                    </div>
                    <div className="border-b border-black/25 px-2 py-2 text-right font-medium">
                      {row.amount.trim()
                        ? formatPrintAmount(parseAmount(row.amount), exportLanguage)
                        : "-"}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {overflowRows.length > 0 ? (
              <div className="mt-2 px-0.5 text-[10px] leading-[1.125rem] text-black/75">
                <span className="font-medium">
                  {formatOverflowRowsSummary(overflowRows.length, exportLanguage)}
                </span>
                <span className="ml-2 font-semibold">
                  {formatPrintAmount(overflowAmount, exportLanguage)}
                </span>
              </div>
            ) : null}

            <div className="mt-2.5 flex items-center justify-end border-t border-black/25 px-0.5 py-2 text-[12px]">
              <span className="font-medium">{exportCopy.total}:</span>
              <span className="ml-3 text-sm font-semibold">
                {formatPrintAmount(totalAmount, exportLanguage)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 text-[10px]">
              {exportCopy.signatures.map((label) => (
                <div className="text-center" key={label}>
                  <p className="font-semibold tracking-[0.02em]">{exportCopy.signatureHint}</p>
                  <div className="mt-7 border-b border-black/75" />
                  <p className="mt-2 text-black/80">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {receiptPages.map((pageEntries, pageIndex) => (
          <section
            className="print-only print-card print-sheet mt-3 rounded-none bg-white p-3 text-black"
            key={`receipt-page-${pageIndex + 1}`}
            style={{ breakBefore: "page" }}
          >
            <div className="p-0">
              <div className="border-b border-black/25 pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/55">
                  {exportCopy.receiptsSheetTitle}
                </p>
                <p className="mt-1.5 text-[12px] text-black/65">
                  {formatReceiptPageCounter(pageIndex + 1, receiptPages.length, exportLanguage)}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                {pageEntries.map((entry) => (
                  <article className="p-0" key={entry.key}>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-black/55">
                      {entry.label}
                    </p>
                    <p className="mt-1 line-clamp-1 text-[11px] text-black/65">
                      {formatExportExpenseTypeLabel(entry.row.typeId, exportLanguage)}
                    </p>

                    <div className="mt-2 flex h-48 items-center justify-center overflow-hidden border border-black/25 p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- eager loading avoids missing receipt images in printed output. */}
                      <img
                        alt={entry.label}
                        className="h-full w-full object-contain"
                        decoding="sync"
                        loading="eager"
                        src={entry.receipt.previewUrl}
                      />
                    </div>

                    <p className="mt-1.5 line-clamp-1 text-[10px] text-black/60">
                      {entry.receipt.name}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ))}

        {isPreparingPrint ? (
          <div className="screen-only fixed inset-0 z-40 flex items-center justify-center bg-background/75 px-4 backdrop-blur-md">
            <div className="premium-panel w-full max-w-md rounded-[2rem] border border-border/60 px-6 py-7 text-center shadow-2xl">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                <LoaderCircle className="size-7 animate-spin" />
              </div>
              <p className="mt-5 font-serif text-3xl tracking-tight text-foreground">
                Preparing your export
              </p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                We&apos;re loading the receipt photos first so they appear properly in the
                printed file.
              </p>
              <div className="mt-6 flex items-center justify-center gap-2">
                <span className="size-2 rounded-full bg-primary/90 animate-[pulse_1.4s_ease-in-out_infinite]" />
                <span
                  className="size-2 rounded-full bg-primary/65 animate-[pulse_1.4s_ease-in-out_180ms_infinite]"
                />
                <span
                  className="size-2 rounded-full bg-primary/45 animate-[pulse_1.4s_ease-in-out_360ms_infinite]"
                />
              </div>
            </div>
          </div>
        ) : null}

        <AlertDialog
          open={pendingRemoval !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingRemoval(null);
            }
          }}
        >
          <AlertDialogContent className="rounded-[1.75rem] border-border/60 p-6">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingRemoval?.kind === "receipt"
                  ? "Remove this receipt photo?"
                  : "Remove this expense row?"}
              </AlertDialogTitle>
              <AlertDialogDescription className="leading-7">
                {pendingRemoval?.kind === "receipt"
                  ? `This will remove "${pendingRemoval.receiptName}" from ${pendingRemoval.rowReference}.`
                  : pendingRemoval
                    ? `This will remove ${pendingRemoval.rowReference} and all of its receipt photos.`
                    : "This action cannot be undone on this page."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-full">Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-full"
                variant="destructive"
                onClick={confirmPendingRemoval}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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

function formatExpenseLineReference(expenseCode: string, lineNumber: number) {
  const normalizedLineNumber = Number.isFinite(lineNumber) ? Math.max(1, lineNumber) : 1;
  const lineSequence = String(normalizedLineNumber).padStart(2, "0");

  if (!expenseCode) {
    return `DRAFT-${lineSequence}`;
  }

  return `${expenseCode}-${lineSequence}`;
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

function formatOverflowRowsSummary(count: number, language: ExportLanguage) {
  if (language === "th") {
    return `รวมอีก ${count} รายการในยอดรวมด้านล่าง`;
  }

  return `${count} more expense ${count === 1 ? "line is" : "lines are"} included in the total below`;
}

function formatReceiptPageCounter(
  currentPage: number,
  totalPages: number,
  language: ExportLanguage,
) {
  if (language === "th") {
    return `หน้า ${currentPage} จาก ${totalPages}`;
  }

  return `Page ${currentPage} of ${totalPages}`;
}

function chunkEntries<T>(entries: T[], size: number) {
  if (entries.length === 0) {
    return [] as T[][];
  }

  const chunks: T[][] = [];

  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }

  return chunks;
}

function LoadingExpenseDayState() {
  return (
    <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
      <CardContent className="px-6 py-8 sm:px-10 sm:py-10">
        <div className="flex flex-col gap-8">
          <div className="text-center">
            <Badge className="rounded-full px-3 py-1" variant="secondary">
              Opening your page
            </Badge>
            <div className="mt-5 flex items-center justify-center gap-3">
              {[0, 180, 360].map((delay) => (
                <span
                  className="size-3 rounded-full bg-primary/80 animate-[pulse_1.6s_ease-in-out_infinite]"
                  key={delay}
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
            <p className="mt-5 font-serif text-3xl tracking-tight text-foreground">
              Getting your expenses ready
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
              We&apos;re loading your saved rows, receipt photos, and company details for
              this day.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.75rem] border border-white/10 bg-background/55 p-5">
              <Skeleton className="h-4 w-28 rounded-full" />
              <Skeleton className="mt-4 h-10 w-3/4 rounded-2xl" />
              <Skeleton className="mt-3 h-4 w-full rounded-full" />
              <Skeleton className="mt-2 h-4 w-5/6 rounded-full" />
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-background/55 p-5">
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton className="h-24 rounded-[1.5rem]" key={index} />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                className="rounded-[1.75rem] border border-white/10 bg-background/55 p-5"
                key={index}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Skeleton className="h-7 w-28 rounded-full" />
                      <Skeleton className="h-7 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-72 rounded-full" />
                  </div>
                  <Skeleton className="h-10 w-24 rounded-2xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
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
    <div className="px-0.5 py-0.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-black/45">
        {label}
      </p>
      <p className="mt-1 line-clamp-2 border-b border-black/15 pb-1 text-[13px] leading-5">
        {value}
      </p>
    </div>
  );
}

function ReceiptPreviewGrid({
  onRemoveReceipt,
  receipts,
  rowReference,
}: {
  onRemoveReceipt: (receipt: ReceiptDraft) => void;
  receipts: ReceiptDraft[];
  rowReference: string;
}) {
  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-background/60 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">Receipt photos for {rowReference}</p>
          <p className="text-xs text-muted-foreground">
            Remove any photo you no longer want on the export.
          </p>
        </div>
        <Badge className="rounded-full px-3 py-1" variant="outline">
          {receipts.length} photo{receipts.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {receipts.map((receipt) => (
          <div
            className="overflow-hidden rounded-[1.4rem] border border-white/10 bg-background/85"
            key={receipt.id}
          >
            <div className="relative border-b border-white/10 bg-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element -- preview cards use raw urls/data urls and should render immediately. */}
              <img
                alt={receipt.name}
                className="h-40 w-full object-cover"
                decoding="async"
                loading="lazy"
                src={receipt.previewUrl}
              />
              <Button
                className="absolute right-3 top-3 rounded-full border-white/15 bg-background/85 shadow-lg backdrop-blur"
                size="icon-xs"
                type="button"
                variant="secondary"
                onClick={() => onRemoveReceipt(receipt)}
              >
                <X className="size-3.5" />
                <span className="sr-only">Remove receipt photo</span>
              </Button>
            </div>

            <div className="p-3">
              <p className="truncate text-sm font-medium text-foreground">{receipt.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{receipt.sizeLabel}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
