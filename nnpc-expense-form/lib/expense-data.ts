export type ExpenseType = {
  id: string;
  label: string;
};

export type ReceiptDraft = {
  id: string;
  name: string;
  previewUrl: string;
  sizeLabel: string;
  bucketName?: string;
  objectPath?: string;
  mimeType?: string | null;
  sourceUrl?: string;
  file?: File;
  fileSizeBytes?: number | null;
};

export type ExportLanguage = "en" | "th";

export type ExpenseRow = {
  id: number;
  typeId: string;
  amount: string;
  remark: string;
  receipts: ReceiptDraft[];
  isExpanded: boolean;
  isReceiptPreviewOpen: boolean;
};

export type ExpenseSummary = {
  date: string;
  expenseCode: string;
  totalAmount: number;
};

export const EXPENSE_TYPES: ExpenseType[] = [
  { id: "transportation", label: "Transportation" },
  { id: "client_food", label: "Client food" },
  { id: "gas", label: "Gas" },
  { id: "toll_fee", label: "Toll fee" },
  { id: "misc", label: "Miscellaneous" },
];

export function createEmptyRow(id: number): ExpenseRow {
  return {
    id,
    typeId: EXPENSE_TYPES[0]?.id ?? "misc",
    amount: "",
    remark: "",
    receipts: [],
    isExpanded: true,
    isReceiptPreviewOpen: false,
  };
}

export function hasRowContent(row: Pick<ExpenseRow, "amount" | "remark" | "receipts">) {
  return row.amount.trim() !== "" || row.remark.trim() !== "" || row.receipts.length > 0;
}

export function parseAmount(value: string) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return numericValue;
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatFileSize(fileSizeBytes: number) {
  if (fileSizeBytes < 1024) {
    return `${fileSizeBytes} B`;
  }

  if (fileSizeBytes < 1024 * 1024) {
    return `${Math.round(fileSizeBytes / 1024)} KB`;
  }

  return `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPdfReceipt({
  mimeType,
  name,
}: Pick<ReceiptDraft, "mimeType" | "name">) {
  return mimeType?.toLowerCase() === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

export function deriveDisplayName(email: string) {
  const localPart = email.split("@")[0] ?? "";

  if (!localPart) {
    return "Expense owner";
  }

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

export function findExpenseTypeLabel(typeId: string) {
  return (
    EXPENSE_TYPES.find((expenseType) => expenseType.id === typeId)?.label ??
    "Miscellaneous"
  );
}

export function buildRemarkSummary(remark: string) {
  const trimmedRemark = remark.trim();

  if (!trimmedRemark) {
    return "No remark yet";
  }

  if (trimmedRemark.length <= 72) {
    return trimmedRemark;
  }

  return `${trimmedRemark.slice(0, 69)}...`;
}
