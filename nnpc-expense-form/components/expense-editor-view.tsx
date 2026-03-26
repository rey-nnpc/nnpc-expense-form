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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { type UserAccount } from "@/lib/user-account-data";
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
import {
  formatDisplayDate,
  formatExpenseLineReferenceCode,
  formatExpenseReferenceCode,
} from "../lib/date";
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
const EXPORT_FORM_ROWS_PER_PAGE = 15;
const RECEIPTS_PER_PAGE = 4;
const IMAGE_PRELOAD_TIMEOUT_MS = 12_000;
const PRINT_TABLE_GRID_TEMPLATE = "1.6fr 1.75fr 2.95fr 1.25fr";
const EXPORT_PAGE_WIDTH_PX = 794;
const EXPORT_PAGE_HEIGHT_PX = 1123;

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
    formSubtitle: "",
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
    formSubtitle: "",
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

type PrintableFormRow = {
  lineNumber: number;
  row: ExpenseRow;
};

type PrintableReceiptEntry = {
  key: string;
  label: string;
  lineNumber: number;
  receipt: ReceiptDraft;
  row: ExpenseRow;
};

type ExportCopy = (typeof EXPORT_COPY)[ExportLanguage];

type ExportFileHandle = {
  createWritable: () => Promise<{
    close: () => Promise<void>;
    write: (data: Blob) => Promise<void>;
  }>;
};

type ExportSaveTarget =
  | {
      kind: "file-picker";
      handle: ExportFileHandle;
    }
  | {
      fileName: string;
      kind: "download";
    };

type ExportAssetPreparationResult = {
  assetUrlMap: Record<string, string>;
  objectUrls: string[];
};

type ExportPdfSource = {
  assetUrlMap: Record<string, string>;
  displayExpenseReference: string;
  employeeName: string;
  expenseDate: string;
  exportCopy: ExportCopy;
  exportLanguage: ExportLanguage;
  note: string;
  printableFormPages: PrintableFormRow[][];
  receiptPages: PrintableReceiptEntry[][];
  selectedCompanyLogoUrl: string;
  selectedCompanyName: string;
  totalAmount: number;
};

type PendingSaveSnapshot = {
  companyId: string;
  companyLogoBucketName: string;
  companyLogoObjectPath: string;
  companyName: string;
  employeeName: string;
  exportLanguage: ExportLanguage;
  note: string;
  rows: ExpenseRow[];
};

export default function ExpenseEditorView({
  expenseDate,
}: {
  expenseDate: string;
}) {
  return (
    <AuthGate>
      {({ account, session, logout }) => (
        <ProtectedExpenseEditor
          account={account}
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
      return "We couldn't prepare the receipt photos for PDF export. Please try again in a moment.";
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
    return "We couldn't create the PDF export. Please try again.";
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

function isInlineAssetUrl(url: string) {
  return url.startsWith("blob:") || url.startsWith("data:");
}

async function buildExportAssetUrlMap(urls: string[]): Promise<ExportAssetPreparationResult> {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));

  if (uniqueUrls.length === 0) {
    return {
      assetUrlMap: {},
      objectUrls: [],
    };
  }

  const objectUrls: string[] = [];
  const mappedEntries = await Promise.all(
    uniqueUrls.map(async (url) => {
      if (isInlineAssetUrl(url)) {
        return [url, url] as const;
      }

      const response = await fetch(url, {
        cache: "force-cache",
        mode: "cors",
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch export asset (${response.status} ${response.statusText}) for ${url}.`,
        );
      }

      const assetBlob = await response.blob();
      const objectUrl = URL.createObjectURL(assetBlob);
      objectUrls.push(objectUrl);

      return [url, objectUrl] as const;
    }),
  );

  return {
    assetUrlMap: Object.fromEntries(mappedEntries),
    objectUrls,
  };
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function buildExportFileName(reference: string, expenseDate: string) {
  const safeReference = reference
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  return `${safeReference || `expense-${expenseDate}`}.pdf`;
}

const EXPORT_RENDER_SCALE = 2;
const EXPORT_PAGE_PADDING_PX = 45;
const EXPORT_CONTENT_WIDTH_PX = EXPORT_PAGE_WIDTH_PX - EXPORT_PAGE_PADDING_PX * 2;
const EXPORT_TABLE_COLUMN_WIDTHS_PX = [1.6, 1.75, 2.95, 1.25].map(
  (fraction) => (EXPORT_CONTENT_WIDTH_PX * fraction) / 7.55,
);

function createExportPageCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_PAGE_WIDTH_PX * EXPORT_RENDER_SCALE;
  canvas.height = EXPORT_PAGE_HEIGHT_PX * EXPORT_RENDER_SCALE;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("A canvas context was not available for PDF export.");
  }

  context.scale(EXPORT_RENDER_SCALE, EXPORT_RENDER_SCALE);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, EXPORT_PAGE_WIDTH_PX, EXPORT_PAGE_HEIGHT_PX);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.textBaseline = "top";

  return { canvas, context };
}

function truncateTextToWidth(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  let nextText = text.trimEnd();

  while (nextText && context.measureText(`${nextText}\u2026`).width > maxWidth) {
    nextText = nextText.slice(0, -1);
  }

  return nextText ? `${nextText}\u2026` : "\u2026";
}

function splitTextIntoLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const normalizedText = text.replace(/\s+/g, " ").trim();

  if (!normalizedText) {
    return [] as string[];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const character of Array.from(normalizedText)) {
    const candidate = `${currentLine}${character}`;

    if (context.measureText(candidate).width <= maxWidth || currentLine.length === 0) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine.trim());
    currentLine = character;

    if (lines.length === maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  const joinedLines = lines.join("");

  if (joinedLines.length < normalizedText.length && lines.length > 0) {
    lines[lines.length - 1] = truncateTextToWidth(
      context,
      lines[lines.length - 1] ?? "",
      maxWidth,
    );
  }

  return lines.slice(0, maxLines);
}

function drawTextBlock({
  align = "left",
  color = "#000000",
  context,
  font,
  lineHeight,
  maxLines,
  maxWidth,
  text,
  x,
  y,
}: {
  align?: CanvasTextAlign;
  color?: string;
  context: CanvasRenderingContext2D;
  font: string;
  lineHeight: number;
  maxLines: number;
  maxWidth: number;
  text: string;
  x: number;
  y: number;
}) {
  context.save();
  context.fillStyle = color;
  context.font = font;

  const lines = splitTextIntoLines(context, text, maxWidth, maxLines);

  lines.forEach((line, index) => {
    const drawX =
      align === "right" ? x + maxWidth - context.measureText(line).width : x;

    context.fillText(line, drawX, y + index * lineHeight);
  });

  context.restore();

  return lines.length * lineHeight;
}

function drawHorizontalRule(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  color: string,
) {
  context.save();
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.moveTo(x, y);
  context.lineTo(x + width, y);
  context.stroke();
  context.restore();
}

function drawImageContain({
  context,
  height,
  image,
  width,
  x,
  y,
}: {
  context: CanvasRenderingContext2D;
  height: number;
  image: HTMLImageElement;
  width: number;
  x: number;
  y: number;
}) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const targetWidth = image.naturalWidth * scale;
  const targetHeight = image.naturalHeight * scale;
  const drawX = x + (width - targetWidth) / 2;
  const drawY = y + (height - targetHeight) / 2;

  context.drawImage(image, drawX, drawY, targetWidth, targetHeight);
}

function loadCanvasImage(
  url: string,
  cache: Map<string, Promise<HTMLImageElement | null>>,
) {
  const cachedImage = cache.get(url);

  if (cachedImage) {
    return cachedImage;
  }

  const nextImage = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new window.Image();
    image.decoding = "sync";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });

  cache.set(url, nextImage);
  return nextImage;
}

function drawInfoLine({
  context,
  label,
  value,
  width,
  x,
  y,
}: {
  context: CanvasRenderingContext2D;
  label: string;
  value: string;
  width: number;
  x: number;
  y: number;
}) {
  drawTextBlock({
    color: "rgba(0,0,0,0.45)",
    context,
    font: "600 11px Arial, sans-serif",
    lineHeight: 12,
    maxLines: 1,
    maxWidth: width,
    text: label.toUpperCase(),
    x,
    y,
  });

  drawTextBlock({
    context,
    font: "500 13px Arial, sans-serif",
    lineHeight: 20,
    maxLines: 2,
    maxWidth: width,
    text: value,
    x,
    y: y + 18,
  });

  drawHorizontalRule(context, x, y + 52, width, "rgba(0,0,0,0.15)");

  return y + 52;
}

async function renderFormPageCanvas(
  source: ExportPdfSource,
  rows: PrintableFormRow[],
  pageIndex: number,
  imageCache: Map<string, Promise<HTMLImageElement | null>>,
) {
  const { canvas, context } = createExportPageCanvas();
  const contentX = EXPORT_PAGE_PADDING_PX;
  const contentWidth = EXPORT_CONTENT_WIDTH_PX;
  const infoWidth = (contentWidth - 16) / 2;
  const logoSize = 64;
  let y = EXPORT_PAGE_PADDING_PX;

  if (source.selectedCompanyLogoUrl) {
    const logoImage = await loadCanvasImage(source.selectedCompanyLogoUrl, imageCache);

    if (logoImage) {
      drawImageContain({
        context,
        height: logoSize,
        image: logoImage,
        width: logoSize,
        x: contentX,
        y,
      });
    } else {
      drawTextBlock({
        align: "left",
        color: "rgba(0,0,0,0.45)",
        context,
        font: "600 11px Arial, sans-serif",
        lineHeight: 12,
        maxLines: 2,
        maxWidth: logoSize,
        text: "Logo",
        x: contentX + 8,
        y: y + 24,
      });
    }
  }

  const headerTextX = contentX + logoSize + 18;

  drawTextBlock({
    color: "rgba(0,0,0,0.55)",
    context,
    font: "600 10px Arial, sans-serif",
    lineHeight: 11,
    maxLines: 1,
    maxWidth: contentWidth - logoSize - 120,
    text: source.exportCopy.companyCaption.toUpperCase(),
    x: headerTextX,
    y,
  });

  const companyNameHeight = drawTextBlock({
    context,
    font: "600 28px Georgia, 'Times New Roman', serif",
    lineHeight: 24,
    maxLines: 2,
    maxWidth: contentWidth - logoSize - 120,
    text: source.selectedCompanyName || source.exportCopy.companyPending,
    x: headerTextX,
    y: y + 16,
  });

  const hasFormSubtitle = Boolean(source.exportCopy.formSubtitle.trim());
  const subtitleY = y + 16 + companyNameHeight + 4;

  if (hasFormSubtitle) {
    drawTextBlock({
      color: "rgba(0,0,0,0.65)",
      context,
      font: "400 11px Arial, sans-serif",
      lineHeight: 13,
      maxLines: 1,
      maxWidth: contentWidth - logoSize - 120,
      text: source.exportCopy.formSubtitle,
      x: headerTextX,
      y: subtitleY,
    });
  }

  const titleY = hasFormSubtitle ? subtitleY + 20 : y + 16 + companyNameHeight + 8;
  drawTextBlock({
    context,
    font: "700 13px Arial, sans-serif",
    lineHeight: 14,
    maxLines: 1,
    maxWidth: contentWidth - logoSize - 120,
    text: source.exportCopy.formTitle,
    x: headerTextX,
    y: titleY,
  });

  if (source.printableFormPages.length > 1) {
    drawTextBlock({
      align: "right",
      color: "rgba(0,0,0,0.55)",
      context,
      font: "600 9px Arial, sans-serif",
      lineHeight: 10,
      maxLines: 1,
      maxWidth: 140,
      text: formatFormPageCounter(
        pageIndex + 1,
        source.printableFormPages.length,
        source.exportLanguage,
      ),
      x: contentX + contentWidth - 140,
      y: y + 2,
    });
  }

  const headerBottom = Math.max(y + logoSize, titleY + 18);
  drawHorizontalRule(context, contentX, headerBottom + 10, contentWidth, "rgba(0,0,0,0.25)");
  y = headerBottom + 26;

  drawInfoLine({
    context,
    label: source.exportCopy.date,
    value: formatExportDate(source.expenseDate, source.exportLanguage),
    width: infoWidth,
    x: contentX,
    y,
  });
  drawInfoLine({
    context,
    label: source.exportCopy.employee,
    value: source.employeeName,
    width: infoWidth,
    x: contentX + infoWidth + 16,
    y,
  });

  y += 70;

  drawInfoLine({
    context,
    label: source.exportCopy.reference,
    value: source.displayExpenseReference,
    width: infoWidth,
    x: contentX,
    y,
  });

  y += 68;

  drawTextBlock({
    color: "rgba(0,0,0,0.55)",
    context,
    font: "600 10px Arial, sans-serif",
    lineHeight: 11,
    maxLines: 1,
    maxWidth: contentWidth,
    text: source.exportCopy.note.toUpperCase(),
    x: contentX,
    y,
  });

  drawTextBlock({
    context,
    font: "400 11px Arial, sans-serif",
    lineHeight: 16,
    maxLines: 2,
    maxWidth: contentWidth,
    text: source.note || source.exportCopy.noteFallback,
    x: contentX,
    y: y + 18,
  });
  drawHorizontalRule(context, contentX, y + 54, contentWidth, "rgba(0,0,0,0.15)");
  y += 70;

  const tableX = contentX;
  const tableY = y;
  const tableHeaderHeight = 30;
  const tableRowHeight = 38;
  const tableHeight =
    rows.length === 0
      ? 48
      : tableHeaderHeight + tableRowHeight * rows.length;

  context.save();
  context.fillStyle = "rgba(0,0,0,0.035)";
  context.fillRect(tableX, tableY, contentWidth, tableHeaderHeight);
  context.restore();

  context.save();
  context.strokeStyle = "rgba(0,0,0,0.4)";
  context.lineWidth = 1;
  context.strokeRect(tableX, tableY, contentWidth, tableHeight);
  context.restore();

  const columnLefts = EXPORT_TABLE_COLUMN_WIDTHS_PX.reduce<number[]>(
    (positions, width, index) => {
      if (index === 0) {
        return [tableX];
      }

      return [...positions, positions[index - 1] + EXPORT_TABLE_COLUMN_WIDTHS_PX[index - 1]];
    },
    [],
  );

  EXPORT_TABLE_COLUMN_WIDTHS_PX.slice(0, -1).forEach((width, index) => {
    const dividerX = (columnLefts[index] ?? tableX) + width;
    context.save();
    context.beginPath();
    context.strokeStyle = "rgba(0,0,0,0.25)";
    context.moveTo(dividerX, tableY);
    context.lineTo(dividerX, tableY + tableHeight);
    context.stroke();
    context.restore();
  });

  context.save();
  context.beginPath();
  context.strokeStyle = "rgba(0,0,0,0.35)";
  context.moveTo(tableX, tableY + tableHeaderHeight);
  context.lineTo(tableX + contentWidth, tableY + tableHeaderHeight);
  context.stroke();
  context.restore();

  [
    source.exportCopy.line,
    source.exportCopy.expenseType,
    source.exportCopy.expenseNote,
    source.exportCopy.amount,
  ].forEach((label, index) => {
    drawTextBlock({
      align: index === 3 ? "right" : "left",
      color: "rgba(0,0,0,0.85)",
      context,
      font: "700 8px Arial, sans-serif",
      lineHeight: 10,
      maxLines: 1,
      maxWidth: (EXPORT_TABLE_COLUMN_WIDTHS_PX[index] ?? 0) - 16,
      text: label.toUpperCase(),
      x: (columnLefts[index] ?? tableX) + 8,
      y: tableY + 10,
    });
  });

  if (rows.length === 0) {
    drawTextBlock({
      color: "rgba(0,0,0,0.6)",
      context,
      font: "400 13px Arial, sans-serif",
      lineHeight: 16,
      maxLines: 2,
      maxWidth: contentWidth - 20,
      text: source.exportCopy.noExpenses,
      x: tableX + 10,
      y: tableY + tableHeaderHeight + 12,
    });
  } else {
    rows.forEach(({ lineNumber, row }, rowIndex) => {
      const rowTop = tableY + tableHeaderHeight + rowIndex * tableRowHeight;

      context.save();
      context.beginPath();
      context.strokeStyle = "rgba(0,0,0,0.25)";
      context.moveTo(tableX, rowTop + tableRowHeight);
      context.lineTo(tableX + contentWidth, rowTop + tableRowHeight);
      context.stroke();
      context.restore();

      drawTextBlock({
        color: "#000000",
        context,
        font: "700 8px Arial, sans-serif",
        lineHeight: 10,
        maxLines: 2,
        maxWidth: (EXPORT_TABLE_COLUMN_WIDTHS_PX[0] ?? 0) - 16,
        text: formatExpenseLineReferenceCode(
          source.expenseDate,
          lineNumber,
          source.displayExpenseReference,
        ),
        x: tableX + 8,
        y: rowTop + 8,
      });

      drawTextBlock({
        color: "#000000",
        context,
        font: "600 11px Arial, sans-serif",
        lineHeight: 13,
        maxLines: 2,
        maxWidth: (EXPORT_TABLE_COLUMN_WIDTHS_PX[1] ?? 0) - 16,
        text: formatExportExpenseTypeLabel(row.typeId, source.exportLanguage),
        x: (columnLefts[1] ?? tableX) + 8,
        y: rowTop + 7,
      });

      drawTextBlock({
        color: "rgba(0,0,0,0.78)",
        context,
        font: "400 10px Arial, sans-serif",
        lineHeight: 13,
        maxLines: 2,
        maxWidth: (EXPORT_TABLE_COLUMN_WIDTHS_PX[2] ?? 0) - 16,
        text: row.remark || source.exportCopy.emptyRemark,
        x: (columnLefts[2] ?? tableX) + 8,
        y: rowTop + 7,
      });

      drawTextBlock({
        align: "right",
        color: "#000000",
        context,
        font: "600 11px Arial, sans-serif",
        lineHeight: 13,
        maxLines: 1,
        maxWidth: (EXPORT_TABLE_COLUMN_WIDTHS_PX[3] ?? 0) - 16,
        text: row.amount.trim()
          ? formatPrintAmount(parseAmount(row.amount), source.exportLanguage)
          : "-",
        x: (columnLefts[3] ?? tableX) + 8,
        y: rowTop + 11,
      });
    });
  }

  if (pageIndex === source.printableFormPages.length - 1) {
    const fixedFooterTop = EXPORT_PAGE_HEIGHT_PX - EXPORT_PAGE_PADDING_PX - 126;
    const footerTop = Math.max(tableY + tableHeight + 14, fixedFooterTop);
    drawHorizontalRule(context, contentX, footerTop, contentWidth, "rgba(0,0,0,0.25)");

    drawTextBlock({
      align: "right",
      context,
      font: "600 12px Arial, sans-serif",
      lineHeight: 14,
      maxLines: 1,
      maxWidth: contentWidth,
      text: `${source.exportCopy.total}: ${formatPrintAmount(
        source.totalAmount,
        source.exportLanguage,
      )}`,
      x: contentX,
      y: footerTop + 10,
    });

    const signatureTop = footerTop + 56;
    const signatureGap = 14;
    const signatureWidth = (contentWidth - signatureGap * 2) / 3;

    source.exportCopy.signatures.forEach((label, signatureIndex) => {
      const signatureX = contentX + signatureIndex * (signatureWidth + signatureGap);
      const centeredX = signatureX + signatureWidth / 2;

      context.save();
      context.fillStyle = "#000000";
      context.font = "600 9px Arial, sans-serif";
      const hintWidth = context.measureText(source.exportCopy.signatureHint).width;
      context.fillText(source.exportCopy.signatureHint, centeredX - hintWidth / 2, signatureTop);
      context.restore();

      drawHorizontalRule(
        context,
        signatureX,
        signatureTop + 34,
        signatureWidth,
        "rgba(0,0,0,0.75)",
      );

      context.save();
      context.fillStyle = "rgba(0,0,0,0.8)";
      context.font = "400 9px Arial, sans-serif";
      const labelWidth = context.measureText(label).width;
      context.fillText(label, centeredX - labelWidth / 2, signatureTop + 44);
      context.restore();
    });
  }

  return canvas;
}

async function renderReceiptPageCanvas(
  source: ExportPdfSource,
  entries: PrintableReceiptEntry[],
  pageIndex: number,
  imageCache: Map<string, Promise<HTMLImageElement | null>>,
) {
  const { canvas, context } = createExportPageCanvas();
  const contentX = EXPORT_PAGE_PADDING_PX;
  const contentWidth = EXPORT_CONTENT_WIDTH_PX;
  const gridGap = 18;
  const cellWidth = (contentWidth - gridGap) / 2;
  const itemHeight = 430;
  const imageHeight = 300;
  let y = EXPORT_PAGE_PADDING_PX;

  drawTextBlock({
    color: "rgba(0,0,0,0.55)",
    context,
    font: "600 10px Arial, sans-serif",
    lineHeight: 11,
    maxLines: 1,
    maxWidth: contentWidth,
    text: source.exportCopy.receiptsSheetTitle.toUpperCase(),
    x: contentX,
    y,
  });

  drawTextBlock({
    color: "rgba(0,0,0,0.65)",
    context,
    font: "400 12px Arial, sans-serif",
    lineHeight: 14,
    maxLines: 1,
    maxWidth: contentWidth,
    text: formatReceiptPageCounter(pageIndex + 1, source.receiptPages.length, source.exportLanguage),
    x: contentX,
    y: y + 18,
  });

  drawHorizontalRule(context, contentX, y + 44, contentWidth, "rgba(0,0,0,0.25)");
  y += 60;

  for (const [entryIndex, entry] of entries.entries()) {
    const columnIndex = entryIndex % 2;
    const rowIndex = Math.floor(entryIndex / 2);
    const cardX = contentX + columnIndex * (cellWidth + gridGap);
    const cardY = y + rowIndex * (itemHeight + gridGap);
    const receiptPreviewUrl =
      source.assetUrlMap[entry.receipt.previewUrl] ?? entry.receipt.previewUrl;
    const receiptImage = await loadCanvasImage(receiptPreviewUrl, imageCache);

    drawTextBlock({
      color: "rgba(0,0,0,0.55)",
      context,
      font: "600 9px Arial, sans-serif",
      lineHeight: 11,
      maxLines: 1,
      maxWidth: cellWidth,
      text: entry.label.toUpperCase(),
      x: cardX,
      y: cardY,
    });

    drawTextBlock({
      color: "rgba(0,0,0,0.65)",
      context,
      font: "400 11px Arial, sans-serif",
      lineHeight: 13,
      maxLines: 1,
      maxWidth: cellWidth,
      text: formatExportExpenseTypeLabel(entry.row.typeId, source.exportLanguage),
      x: cardX,
      y: cardY + 18,
    });

    context.save();
    context.strokeStyle = "rgba(0,0,0,0.25)";
    context.strokeRect(cardX, cardY + 44, cellWidth, imageHeight);
    context.restore();

    if (receiptImage) {
      drawImageContain({
        context,
        height: imageHeight - 16,
        image: receiptImage,
        width: cellWidth - 16,
        x: cardX + 8,
        y: cardY + 52,
      });
    } else {
      drawTextBlock({
        color: "rgba(0,0,0,0.45)",
        context,
        font: "500 12px Arial, sans-serif",
        lineHeight: 14,
        maxLines: 2,
        maxWidth: cellWidth - 24,
        text: "Receipt image unavailable",
        x: cardX + 12,
        y: cardY + 170,
      });
    }

    drawTextBlock({
      color: "rgba(0,0,0,0.6)",
      context,
      font: "400 10px Arial, sans-serif",
      lineHeight: 12,
      maxLines: 1,
      maxWidth: cellWidth,
      text: entry.receipt.name,
      x: cardX,
      y: cardY + imageHeight + 56,
    });
  }

  return canvas;
}

async function createExportPdfBlob(source: ExportPdfSource) {
  const [{ jsPDF }] = await Promise.all([import("jspdf")]);
  const pdf = new jsPDF({
    compress: true,
    format: "a4",
    orientation: "portrait",
    unit: "mm",
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
  let renderedPageIndex = 0;

  for (const [formPageIndex, pageRows] of source.printableFormPages.entries()) {
    const canvas = await renderFormPageCanvas(source, pageRows, formPageIndex, imageCache);

    if (renderedPageIndex > 0) {
      pdf.addPage("a4", "portrait");
    }

    pdf.addImage(canvas, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
    renderedPageIndex += 1;
  }

  for (const [receiptPageIndex, pageEntries] of source.receiptPages.entries()) {
    const canvas = await renderReceiptPageCanvas(
      source,
      pageEntries,
      receiptPageIndex,
      imageCache,
    );

    if (renderedPageIndex > 0) {
      pdf.addPage("a4", "portrait");
    }

    pdf.addImage(canvas, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
    renderedPageIndex += 1;
  }

  const exportBlob = pdf.output("blob");
  return exportBlob;
}

async function requestExportSaveTarget(fileName: string) {
  const saveWindow = window as Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        accept: Record<string, string[]>;
        description: string;
      }>;
    }) => Promise<ExportFileHandle>;
  };

  const canUseFilePicker = Boolean(saveWindow.showSaveFilePicker && window.isSecureContext);

  if (canUseFilePicker) {
    const showSaveFilePicker = saveWindow.showSaveFilePicker;

    if (!showSaveFilePicker) {
      throw new Error("showSaveFilePicker became unavailable before export save started.");
    }

    try {
      const fileHandle = await showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            accept: {
              "application/pdf": [".pdf"],
            },
            description: "PDF document",
          },
        ],
      });

      return {
        handle: fileHandle,
        kind: "file-picker",
      } satisfies ExportSaveTarget;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }

      throw error;
    }
  }

  return {
    fileName,
    kind: "download",
  } satisfies ExportSaveTarget;
}

async function saveExportPdfBlob(blob: Blob, saveTarget: ExportSaveTarget) {
  if (saveTarget.kind === "file-picker") {
    const writable = await saveTarget.handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  }

  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.style.display = "none";
  anchor.href = blobUrl;
  anchor.download = saveTarget.fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  return true;
}

function DesktopExportPreviewPageCard({
  children,
  scale,
}: {
  children: ReactNode;
  scale: number;
}) {
  return (
    <div className="export-preview-frame mx-auto max-w-full">
      <div
        className="overflow-hidden"
        style={{
          height: `${EXPORT_PAGE_HEIGHT_PX * scale}px`,
          width: `${EXPORT_PAGE_WIDTH_PX * scale}px`,
        }}
      >
        <div
          className="origin-top-left"
          style={{
            transform: `scale(${scale})`,
            width: `${EXPORT_PAGE_WIDTH_PX}px`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function MobileExportPreviewPageCard({
  children,
  label,
  scale,
}: {
  children: ReactNode;
  label: string;
  scale: number;
}) {
  return (
    <article className="rounded-[1.45rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-2 shadow-[0_18px_52px_-34px_rgba(15,23,42,0.55)]">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <Badge className="rounded-full px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.2em]" variant="secondary">
          {label}
        </Badge>
        <p className="text-[0.64rem] uppercase tracking-[0.22em] text-muted-foreground">
          Mobile fit
        </p>
      </div>

      <div className="overflow-hidden rounded-[1.1rem] border border-black/8 bg-[linear-gradient(180deg,#edf2ed,#e2e9e2)] p-1.5">
        <div
          className="mx-auto overflow-hidden rounded-[0.9rem] bg-white"
          style={{
            height: `${EXPORT_PAGE_HEIGHT_PX * scale}px`,
            width: `${EXPORT_PAGE_WIDTH_PX * scale}px`,
          }}
        >
          <div
            className="origin-top-left"
            style={{
              transform: `scale(${scale})`,
              width: `${EXPORT_PAGE_WIDTH_PX}px`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </article>
  );
}

function ProtectedExpenseEditor({
  account,
  expenseDate,
  logout,
  session,
}: {
  account: UserAccount;
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
  const [exportLanguage, setExportLanguage] = useState<ExportLanguage>("en");
  const [note, setNote] = useState("");
  const [expenseCode, setExpenseCode] = useState("");
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [isLoadingDocument, setIsLoadingDocument] = useState(true);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastPrintedAt, setLastPrintedAt] = useState<string | null>(null);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [isMobileExportPreview, setIsMobileExportPreview] = useState(false);
  const [exportPreviewScale, setExportPreviewScale] = useState(1);
  const [exportAssetUrlMap, setExportAssetUrlMap] = useState<Record<string, string>>({});
  const [printError, setPrintError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const pendingSaveRef = useRef<PendingSaveSnapshot | null>(null);
  const isPersistingRef = useRef(false);
  const activeSavePromiseRef = useRef<Promise<string | null> | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const skipNextAutosaveRef = useRef(true);
  const hasLoadedDocumentRef = useRef(false);
  const exportAssetObjectUrlsRef = useRef<string[]>([]);
  const exportPreviewViewportRef = useRef<HTMLDivElement | null>(null);

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
      setExportLanguage("en");
      setExpenseCode("");
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
      setExpenseCode(existingReport.expenseCode);
      setNote(existingReport.note);
      setRows(buildRowsFromLoadedReport(existingReport.rows));
    }

    skipNextAutosaveRef.current = true;
    hasLoadedDocumentRef.current = true;
  });

  const loadDocument = useEffectEvent(
    async (
      nextCacheUserKey: string,
      nextExpenseDate: string,
      isActive: () => boolean,
    ) => {
      const cachedCompanies = readCompaniesCache(nextCacheUserKey);
      const cachedExpenseDay = readExpenseDayCache(nextCacheUserKey, nextExpenseDate);
      const [nextCompanies, existingReport] = await Promise.all([
        cachedCompanies
          ? Promise.resolve(cachedCompanies)
          : listUserCompanies(session.accessToken),
        cachedExpenseDay
          ? Promise.resolve(cachedExpenseDay)
          : getExpenseDay(session.accessToken, nextExpenseDate),
      ]);

      if (!isActive()) {
        return;
      }

      if (!cachedCompanies) {
        writeCompaniesCache(nextCacheUserKey, nextCompanies);
      }

      if (existingReport && !cachedExpenseDay) {
        writeExpenseDayCache(nextCacheUserKey, nextExpenseDate, existingReport);
      }

      applyLoadedDocument(existingReport, nextCompanies);
    },
  );

  const handleLoadDocumentError = useEffectEvent((error: unknown) => {
    if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
      void logout();
      return;
    }

    setDocumentError(getFriendlyEditorError(error, "load"));
  });

  useEffect(() => {
    let isActive = true;

    // Keep the editor state stable during auth/account refreshes. Re-load only when the
    // actual document identity changes, and use the latest session inside the effect event.
    void loadDocument(cacheUserKey, expenseDate, () => isActive)
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        handleLoadDocumentError(error);
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingDocument(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [cacheUserKey, expenseDate]);

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);
  const shouldUseLoadedCompanySnapshot =
    !selectedCompany &&
    ((selectedCompanyId && selectedCompanyId === loadedCompanyId) ||
      (!selectedCompanyId &&
        !loadedCompanyId &&
        Boolean(loadedCompanyName.trim() || loadedCompanyLogoUrl)));
  const selectedCompanyName =
    selectedCompany?.companyName ??
    (shouldUseLoadedCompanySnapshot ? loadedCompanyName : "");
  const selectedCompanyLogoBucketName =
    selectedCompany?.logoBucketName ??
    (shouldUseLoadedCompanySnapshot ? loadedCompanyLogoBucketName : "");
  const selectedCompanyLogoObjectPath =
    selectedCompany?.logoObjectPath ??
    (shouldUseLoadedCompanySnapshot ? loadedCompanyLogoObjectPath : "");
  const selectedCompanyLogoUrl =
    selectedCompany?.logoUrl ?? (shouldUseLoadedCompanySnapshot ? loadedCompanyLogoUrl : "");

  const persistSnapshot = async (nextSnapshot: PendingSaveSnapshot) => {
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

      return saveResult.expenseCode;
    } catch (error) {
      if (error instanceof Error && error.message === SESSION_EXPIRED_MESSAGE) {
        void logout();
        return null;
      }

      setSaveError(
        getFriendlyEditorError(error, "save"),
      );
      return null;
    } finally {
      isPersistingRef.current = false;
      setIsSavingDocument(false);
    }
  };

  const startSave = (nextSnapshot: PendingSaveSnapshot) => {
    const nextSavePromise = persistSnapshot(nextSnapshot).finally(() => {
      if (activeSavePromiseRef.current === nextSavePromise) {
        activeSavePromiseRef.current = null;
      }

      if (pendingSaveRef.current) {
        const queuedSnapshot = pendingSaveRef.current;
        pendingSaveRef.current = null;
        void startSave(queuedSnapshot);
      }
    });

    activeSavePromiseRef.current = nextSavePromise;
    return nextSavePromise;
  };

  const flushPendingSave = useEffectEvent(async () => {
    if (isPersistingRef.current) {
      return activeSavePromiseRef.current;
    }

    const nextSnapshot = pendingSaveRef.current;

    if (!nextSnapshot) {
      return null;
    }

    pendingSaveRef.current = null;
    return startSave(nextSnapshot);
  });

  const ensurePersistedExpenseCode = async () => {
    const currentExpenseCode = expenseCode.trim();

    if (currentExpenseCode) {
      return currentExpenseCode;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (isPersistingRef.current) {
      const inFlightExpenseCode = await activeSavePromiseRef.current;

      if (inFlightExpenseCode?.trim()) {
        return inFlightExpenseCode;
      }
    }

    pendingSaveRef.current = null;

    const persistedExpenseCode = await startSave({
      companyId: selectedCompanyId,
      companyLogoBucketName: selectedCompanyLogoBucketName,
      companyLogoObjectPath: selectedCompanyLogoObjectPath,
      companyName: selectedCompanyName,
      employeeName,
      exportLanguage,
      note,
      rows,
    });

    if (persistedExpenseCode?.trim()) {
      return persistedExpenseCode;
    }

    throw new Error("Expense reference was not ready for export.");
  };

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

  useEffect(() => {
    if (!isExportPreviewOpen || !exportPreviewViewportRef.current) {
      return;
    }

    const viewport = exportPreviewViewportRef.current;

    const syncPreviewScale = () => {
      const nextIsMobilePreview = viewport.clientWidth < 768;
      const availableWidth = Math.max(220, viewport.clientWidth - (nextIsMobilePreview ? 12 : 0));
      const widthScale = availableWidth / EXPORT_PAGE_WIDTH_PX;

      setIsMobileExportPreview(nextIsMobilePreview);

      if (nextIsMobilePreview) {
        const availableHeight = Math.max(240, viewport.clientHeight - 24);
        const heightScale = availableHeight / EXPORT_PAGE_HEIGHT_PX;
        const nextScale = Math.min(0.78, Math.max(0.22, Math.min(widthScale, heightScale)));

        setExportPreviewScale(nextScale);
        return;
      }

      const nextScale = Math.min(1, Math.max(0.34, widthScale));
      setExportPreviewScale(nextScale);
    };

    syncPreviewScale();

    const resizeObserver = new ResizeObserver(() => {
      syncPreviewScale();
    });

    resizeObserver.observe(viewport);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isExportPreviewOpen]);

  useEffect(() => {
    return () => {
      for (const objectUrl of exportAssetObjectUrlsRef.current) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, []);

  const rowNumberById = new Map(rows.map((row, index) => [row.id, index + 1]));
  const populatedRows = rows.filter(hasRowContent);
  const populatedRowsWithLineNumbers: PrintableFormRow[] = populatedRows.map((row, index) => ({
    lineNumber: index + 1,
    row,
  }));
  const displayExpenseReference = formatExpenseReferenceCode(expenseDate, expenseCode);
  const printableEmployeeName = employeeName || defaultEmployeeName;
  const totalAmount = rows.reduce((sum, row) => sum + parseAmount(row.amount), 0);
  const totalReceipts = rows.reduce((sum, row) => sum + row.receipts.length, 0);
  const exportCopy = EXPORT_COPY[exportLanguage];
  const hasStoredCompanySnapshot = Boolean(loadedCompanyName.trim() || loadedCompanyLogoUrl);
  const printableFormPages =
    populatedRowsWithLineNumbers.length > 0
      ? chunkEntries(populatedRowsWithLineNumbers, EXPORT_FORM_ROWS_PER_PAGE)
      : [populatedRowsWithLineNumbers];
  const exportValidationMessage =
    !selectedCompanyName.trim()
      ? companies.length === 0 && !hasStoredCompanySnapshot
        ? "Add a company profile with a logo in Company Headers before exporting."
        : "Select a company profile before exporting."
      : !selectedCompanyLogoUrl
        ? "The selected company profile is missing a logo. Update it in Company Headers before exporting."
        : null;
  const canExport = exportValidationMessage === null;
  const printableReceipts: PrintableReceiptEntry[] = populatedRowsWithLineNumbers.flatMap(
    ({ lineNumber, row }) =>
    row.receipts.map((receipt, receiptIndex) => ({
      key: `${row.id}-${receipt.id}`,
      label: `${exportCopy.receiptLabel} - ${formatExpenseLineReferenceCode(
        expenseDate,
        lineNumber,
        expenseCode,
      )}${
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
  const exportSelectedCompanyLogoUrl =
    exportAssetUrlMap[selectedCompanyLogoUrl] ?? selectedCompanyLogoUrl;
  const exportPreviewPages = [
    ...printableFormPages.map((pageRows, pageIndex) => ({
      key: `form-page-${pageIndex + 1}`,
      label:
        printableFormPages.length > 1
          ? formatFormPageCounter(pageIndex + 1, printableFormPages.length, exportLanguage)
          : exportCopy.formTitle,
      node: (
        <PrintExpenseFormPage
          currentPage={pageIndex + 1}
          displayExpenseReference={displayExpenseReference}
          employeeName={printableEmployeeName}
          expenseDate={expenseDate}
          exportCopy={exportCopy}
          exportLanguage={exportLanguage}
          note={note}
          rows={pageRows}
          selectedCompanyLogoUrl={exportSelectedCompanyLogoUrl}
          selectedCompanyName={selectedCompanyName}
          showFooter={pageIndex === printableFormPages.length - 1}
          totalAmount={totalAmount}
          totalPages={printableFormPages.length}
        />
      ),
    })),
    ...receiptPages.map((pageEntries, pageIndex) => ({
      key: `receipt-page-${pageIndex + 1}`,
      label: `${exportCopy.receiptsSheetTitle} ${formatReceiptPageCounter(
        pageIndex + 1,
        receiptPages.length,
        exportLanguage,
      )}`,
      node: (
        <ReceiptExportPage
          assetUrlMap={exportAssetUrlMap}
          entries={pageEntries}
          exportCopy={exportCopy}
          exportLanguage={exportLanguage}
          pageIndex={pageIndex}
          totalPages={receiptPages.length}
        />
      ),
    })),
  ];
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
      rowReference: formatExpenseLineReferenceCode(expenseDate, rowNumber, expenseCode),
    });
  };

  const requestReceiptRemoval = (rowId: number, receipt: ReceiptDraft) => {
    const rowNumber = rowNumberById.get(rowId) ?? rowId;

    setPendingRemoval({
      kind: "receipt",
      receiptId: receipt.id,
      receiptName: receipt.name,
      rowId,
      rowReference: formatExpenseLineReferenceCode(expenseDate, rowNumber, expenseCode),
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

    if (!canExport) {
      setPrintError(
        exportValidationMessage ?? "Select a company profile with a logo before exporting.",
      );
      return;
    }

    setPrintError(null);
    setIsPreparingPrint(true);

    try {
      await ensurePersistedExpenseCode();

      const preparedExportAssets = await buildExportAssetUrlMap(printableAssetUrls);

      for (const objectUrl of exportAssetObjectUrlsRef.current) {
        URL.revokeObjectURL(objectUrl);
      }

      exportAssetObjectUrlsRef.current = preparedExportAssets.objectUrls;
      setExportAssetUrlMap(preparedExportAssets.assetUrlMap);

      const areAssetsReady = await preloadPrintableAssets(
        Object.values(preparedExportAssets.assetUrlMap),
      );

      if (!areAssetsReady) {
        throw new Error("Printable assets were not ready in time.");
      }

      if ("fonts" in document) {
        await document.fonts.ready;
      }

      await waitForNextFrame();
      setIsExportPreviewOpen(true);
    } catch (error) {
      setPrintError(getFriendlyEditorError(error, "print"));
    } finally {
      setIsPreparingPrint(false);
    }
  };

  const handleConfirmExport = async () => {
    if (isSavingPdf) {
      return;
    }

    setPrintError(null);
    setIsSavingPdf(true);
    const exportFileName = buildExportFileName(displayExpenseReference, expenseDate);

    const exportedAt = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());

    try {
      const saveTarget = await requestExportSaveTarget(exportFileName);

      if (!saveTarget) {
        return;
      }

      if ("fonts" in document) {
        await document.fonts.ready;
      }

      const exportBlob = await createExportPdfBlob({
        assetUrlMap: exportAssetUrlMap,
        displayExpenseReference,
        employeeName: printableEmployeeName,
        expenseDate,
        exportCopy,
        exportLanguage,
        note,
        printableFormPages,
        receiptPages,
        selectedCompanyLogoUrl: exportSelectedCompanyLogoUrl,
        selectedCompanyName,
        totalAmount,
      });
      const didSave = await saveExportPdfBlob(exportBlob, saveTarget);

      if (!didSave) {
        return;
      }

      setLastPrintedAt(exportedAt);
      setIsExportPreviewOpen(false);
    } catch (error) {
      setPrintError(getFriendlyEditorError(error, "print"));
    } finally {
      setIsSavingPdf(false);
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
                      {displayExpenseReference}
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
                      then export a clean PDF with extra receipt pages.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                  <ThemeSettingsSheet userEmail={session.userEmail} />
                  <Button
                    className="w-full rounded-full border-white/10 bg-background/70 px-4 shadow-none backdrop-blur-xl hover:bg-background/90 sm:w-auto"
                    disabled={isPreparingPrint || !canExport}
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
                    {isPreparingPrint ? "Preparing export..." : "Export PDF"}
                  </Button>
                  <Button
                    className="w-full rounded-full border-white/10 bg-background/70 px-4 shadow-none backdrop-blur-xl hover:bg-background/90 sm:w-auto"
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
                    value={displayExpenseReference}
                    icon={<Hash className="size-4" />}
                  />
                  <EditorMetric
                    label="Employee"
                    value={printableEmployeeName}
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

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    asChild
                    className="w-full rounded-full border-white/10 bg-background/70 px-4 shadow-none backdrop-blur-xl hover:bg-background/90 sm:w-auto"
                    size="sm"
                    variant="outline"
                  >
                    <Link href="/dashboard">Back to dashboard</Link>
                  </Button>
                  <Button
                    className="w-full rounded-full px-5 sm:w-auto"
                    size="sm"
                    type="button"
                    onClick={addRow}
                  >
                    <Plus className="size-4" />
                    Create expense
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <TopRouteTabs accountRole={account.role} activeSection="expenses" />

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

                  <Button className="w-full rounded-full px-5 sm:w-auto" type="button" onClick={addRow}>
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
                          Exports extra receipt pages
                        </Badge>
                      </div>
                    </div>

                    {rows.map((row) => {
                      const rowNumber = rowNumberById.get(row.id) ?? row.id;
                      const rowReference = formatExpenseLineReferenceCode(
                        expenseDate,
                        rowNumber,
                        expenseCode,
                      );

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
                                    className="w-full rounded-full border-white/10 bg-background/70 px-4 shadow-none hover:bg-background/85 sm:w-auto"
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
                                      className="w-full rounded-full px-4 sm:w-auto"
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
                                    className="w-full rounded-full px-4 text-destructive hover:text-destructive sm:w-auto"
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

                    <div className="flex justify-center pt-1">
                      <Button
                        className="rounded-full border-white/10 bg-background/70 px-3 text-xs shadow-none hover:bg-background/85"
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <ChevronUp className="size-3.5" />
                        Go back to top
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
              <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
                <CardHeader className="gap-3 border-b border-border/60 px-5 py-5">
                  <Badge className="rounded-full px-3 py-1" variant="secondary">
                    Export setup
                  </Badge>
                  <CardTitle className="font-serif text-2xl tracking-tight sm:text-3xl">
                    Company and form details
                  </CardTitle>
                  <CardDescription className="text-sm leading-7">
                    These details appear across every exported page.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5 px-5 py-5">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">
                      Company for this form
                    </span>
                    <Select
                      disabled={companies.length === 0 && !selectedCompanyId}
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
                    {exportValidationMessage ? (
                      <p className="text-sm leading-6 text-destructive">
                        {exportValidationMessage}
                      </p>
                    ) : (
                      <p className="text-xs leading-6 text-muted-foreground">
                        The selected company name and logo appear on every exported page.
                      </p>
                    )}
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
                          The name and logo show in the PDF header.
                        </p>
                      </div>
                    </div>
                  </div>

                  {companies.length === 0 && !selectedCompanyId && !hasStoredCompanySnapshot ? (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-background/60 px-4 py-4 text-sm text-muted-foreground">
                      Add a company in Company Headers before exporting. A saved logo is
                      required for the PDF header.
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
                      Export status
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {isPreparingPrint
                        ? "Preparing your receipt photos for PDF..."
                        : lastPrintedAt
                          ? `Last exported ${lastPrintedAt}`
                          : "No PDF exported yet"}
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
                        The PDF fits up to fifteen expense lines per page, keeps the same
                        layout on continuation pages, and adds up to four receipt photos
                        on each extra page.
                      </p>
                    </div>
                  </div>

                  <Button
                    className="h-11 w-full rounded-2xl"
                    disabled={isPreparingPrint || !canExport}
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
                    {isPreparingPrint ? "Preparing your export..." : "Export this day sheet"}
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
                        Tip for a cleaner PDF
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

        <Dialog
          open={isExportPreviewOpen}
          onOpenChange={(open) => {
            if (isSavingPdf) {
              return;
            }

            setIsExportPreviewOpen(open);
          }}
        >
          <DialogContent
            className="flex h-[100dvh] w-screen max-w-screen flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[calc(100vh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] sm:rounded-[2rem] sm:border sm:border-border/60 2xl:max-w-[1600px]"
            showCloseButton={!isSavingPdf}
          >
            <DialogHeader className="border-b border-border/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-3 py-3 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <DialogTitle className="pr-10 font-serif text-[1.75rem] tracking-tight sm:pr-0 sm:text-3xl lg:text-4xl">
                    Export preview
                  </DialogTitle>
                  <DialogDescription className="mt-2 max-w-2xl text-sm leading-6 sm:leading-7">
                    Review the full PDF before saving. This preview is scrollable through
                    every expense and receipt page.
                  </DialogDescription>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Badge className="rounded-full px-3 py-1" variant="secondary">
                    {exportPreviewPages.length} page
                    {exportPreviewPages.length === 1 ? "" : "s"}
                  </Badge>
                  <Badge className="rounded-full px-3 py-1" variant="outline">
                    {displayExpenseReference}
                  </Badge>
                </div>
              </div>
            </DialogHeader>

            <div className="border-b border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground sm:px-6 sm:py-3 sm:text-sm">
              Confirm to open your system save prompt and write the PDF directly from this
              preview.
            </div>

            <div
              className="export-preview-shell flex-1 overflow-auto bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.08),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_36%)] px-2 py-2 sm:px-4 sm:py-4 lg:px-6"
              ref={exportPreviewViewportRef}
            >
              <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 sm:gap-6">
                {exportPreviewPages.map((page) =>
                  isMobileExportPreview ? (
                    <MobileExportPreviewPageCard
                      key={page.key}
                      label={page.label}
                      scale={exportPreviewScale}
                    >
                      {page.node}
                    </MobileExportPreviewPageCard>
                  ) : (
                    <DesktopExportPreviewPageCard key={page.key} scale={exportPreviewScale}>
                      {page.node}
                    </DesktopExportPreviewPageCard>
                  ),
                )}
              </div>
            </div>

            <DialogFooter className="border-t border-border/60 bg-background/80 px-3 py-3 sm:px-6 sm:py-4">
              {printError ? (
                <p className="mr-auto max-w-md text-sm leading-6 text-destructive">
                  {printError}
                </p>
              ) : (
                <p className="mr-auto text-sm text-muted-foreground">
                  The saved PDF matches this preview layout.
                </p>
              )}
              <Button
                className="w-full rounded-full sm:w-auto"
                disabled={isSavingPdf}
                type="button"
                variant="outline"
                onClick={() => setIsExportPreviewOpen(false)}
              >
                Close
              </Button>
              <Button
                className="w-full rounded-full px-5 sm:w-auto"
                disabled={isSavingPdf}
                type="button"
                onClick={() => {
                  void handleConfirmExport();
                }}
              >
                {isSavingPdf ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Printer className="size-4" />
                )}
                {isSavingPdf ? "Saving PDF..." : "Confirm and save PDF"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                exported file.
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

function PrintExpenseFormPage({
  currentPage,
  displayExpenseReference,
  employeeName,
  expenseDate,
  exportCopy,
  exportLanguage,
  note,
  rows,
  selectedCompanyLogoUrl,
  selectedCompanyName,
  showFooter,
  totalAmount,
  totalPages,
}: {
  currentPage: number;
  displayExpenseReference: string;
  employeeName: string;
  expenseDate: string;
  exportCopy: ExportCopy;
  exportLanguage: ExportLanguage;
  note: string;
  rows: PrintableFormRow[];
  selectedCompanyLogoUrl: string;
  selectedCompanyName: string;
  showFooter: boolean;
  totalAmount: number;
  totalPages: number;
}) {
  return (
    <section
      className="export-sheet print-card rounded-none bg-white text-black"
      data-export-page
    >
      <div className="flex h-full flex-col p-0">
        <div className="flex items-start gap-3 border-b border-black/25 pb-2.5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[0.85rem]">
            {selectedCompanyLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- eager loading keeps the logo available during PDF export.
              <img
                alt={selectedCompanyName || exportCopy.companyPending}
                className="h-full w-full object-contain"
                crossOrigin="anonymous"
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
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/55">
                  {exportCopy.companyCaption}
                </p>
                <h2 className="mt-1 line-clamp-2 font-serif text-[1.14rem] leading-tight">
                  {selectedCompanyName || exportCopy.companyPending}
                </h2>
                {exportCopy.formSubtitle ? (
                  <p className="mt-0.5 text-[11px] text-black/65">{exportCopy.formSubtitle}</p>
                ) : null}
                <p className={exportCopy.formSubtitle ? "mt-1 text-[13px] font-semibold" : "mt-2 text-[13px] font-semibold"}>
                  {exportCopy.formTitle}
                </p>
              </div>

              {totalPages > 1 ? (
                <p className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.18em] text-black/55">
                  {formatFormPageCounter(currentPage, totalPages, exportLanguage)}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-sm">
          <InfoLine
            label={exportCopy.date}
            value={formatExportDate(expenseDate, exportLanguage)}
          />
          <InfoLine label={exportCopy.employee} value={employeeName} />
          <InfoLine label={exportCopy.reference} value={displayExpenseReference} />
        </div>

        <div className="mt-2 border-b border-black/15 pb-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/55">
            {exportCopy.note}
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-[1.05rem]">
            {note || exportCopy.noteFallback}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="mt-2.5 px-1 py-2 text-sm text-black/60">{exportCopy.noExpenses}</div>
        ) : (
          <div className="mt-2.5 overflow-hidden border border-black/40">
            <div
              className="grid bg-black/[0.035] text-[8px] font-semibold uppercase tracking-[0.12em] text-black/85"
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

            {rows.map(({ lineNumber, row }) => (
              <div
                className="grid text-[10px] text-black"
                key={row.id}
                style={{ gridTemplateColumns: PRINT_TABLE_GRID_TEMPLATE }}
              >
                <div className="border-r border-b border-black/25 px-2 py-1.5 text-[8px] font-semibold leading-[0.92rem] [overflow-wrap:anywhere]">
                  {formatExpenseLineReferenceCode(
                    expenseDate,
                    lineNumber,
                    displayExpenseReference,
                  )}
                </div>
                <div className="border-r border-b border-black/25 px-2 py-1.5">
                  <p className="line-clamp-2 font-medium leading-[1rem]">
                    {formatExportExpenseTypeLabel(row.typeId, exportLanguage)}
                  </p>
                </div>
                <div className="border-r border-b border-black/25 px-2 py-1.5">
                  <p className="line-clamp-2 leading-[1rem] text-black/78">
                    {row.remark || exportCopy.emptyRemark}
                  </p>
                </div>
                <div className="border-b border-black/25 px-2 py-1.5 text-right font-medium">
                  {row.amount.trim()
                    ? formatPrintAmount(parseAmount(row.amount), exportLanguage)
                    : "-"}
                </div>
              </div>
            ))}
          </div>
        )}

        {showFooter ? (
          <div className="mt-auto pt-5">
            <div className="mt-2 flex items-center justify-end border-t border-black/25 px-0.5 py-1.5 text-[12px]">
              <span className="font-medium">{exportCopy.total}:</span>
              <span className="ml-3 text-sm font-semibold">
                {formatPrintAmount(totalAmount, exportLanguage)}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-[9px]">
              {exportCopy.signatures.map((label) => (
                <div className="text-center" key={label}>
                  <p className="font-semibold tracking-[0.02em]">{exportCopy.signatureHint}</p>
                  <div className="mt-5 border-b border-black/75" />
                  <p className="mt-2 text-black/80">{label}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ReceiptExportPage({
  assetUrlMap,
  entries,
  exportCopy,
  exportLanguage,
  pageIndex,
  totalPages,
}: {
  assetUrlMap: Record<string, string>;
  entries: PrintableReceiptEntry[];
  exportCopy: ExportCopy;
  exportLanguage: ExportLanguage;
  pageIndex: number;
  totalPages: number;
}) {
  return (
    <section className="export-sheet print-card rounded-none bg-white text-black" data-export-page>
      <div className="p-0">
        <div className="border-b border-black/25 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/55">
            {exportCopy.receiptsSheetTitle}
          </p>
          <p className="mt-1.5 text-[12px] text-black/65">
            {formatReceiptPageCounter(pageIndex + 1, totalPages, exportLanguage)}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {entries.map((entry) => {
            const receiptPreviewUrl =
              assetUrlMap[entry.receipt.previewUrl] ?? entry.receipt.previewUrl;

            return (
              <article className="p-0" key={entry.key}>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-black/55">
                  {entry.label}
                </p>
                <p className="mt-1 line-clamp-1 text-[11px] text-black/65">
                  {formatExportExpenseTypeLabel(entry.row.typeId, exportLanguage)}
                </p>

                <div className="mt-2 flex h-48 items-center justify-center overflow-hidden border border-black/25 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- eager loading avoids missing receipt images in exported PDF output. */}
                  <img
                    alt={entry.label}
                    className="h-full w-full object-contain"
                    crossOrigin="anonymous"
                    decoding="sync"
                    loading="eager"
                    src={receiptPreviewUrl}
                  />
                </div>

                <p className="mt-1.5 line-clamp-1 text-[10px] text-black/60">
                  {entry.receipt.name}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
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

function formatFormPageCounter(
  currentPage: number,
  totalPages: number,
  language: ExportLanguage,
) {
  if (language === "th") {
    return `หน้าฟอร์ม ${currentPage} จาก ${totalPages}`;
  }

  return `Form page ${currentPage} of ${totalPages}`;
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
