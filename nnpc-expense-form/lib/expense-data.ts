export type ExpenseType = {
  id: string;
  label: string;
};

export type ReceiptDraft = {
  id: string;
  name: string;
  previewUrl: string;
  sizeLabel: string;
};

export type ExpenseRow = {
  id: number;
  typeId: string;
  amount: string;
  remark: string;
  receipts: ReceiptDraft[];
  isExpanded: boolean;
  isReceiptPreviewOpen: boolean;
};

type StoredExpenseRow = Omit<ExpenseRow, "isExpanded" | "isReceiptPreviewOpen">;

type StoredExpenseDraft = {
  date: string;
  employeeName: string;
  note: string;
  rows: StoredExpenseRow[];
  updatedAt: string;
};

export type ExpenseSummary = {
  date: string;
  totalAmount: number;
};

const EXPENSE_STORAGE_KEY = "nnpc-expense-drafts";

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

function canUseStorage() {
  return typeof window !== "undefined";
}

function readStore() {
  if (!canUseStorage()) {
    return {} as Record<string, StoredExpenseDraft>;
  }

  const rawValue = window.localStorage.getItem(EXPENSE_STORAGE_KEY);

  if (!rawValue) {
    return {} as Record<string, StoredExpenseDraft>;
  }

  try {
    return JSON.parse(rawValue) as Record<string, StoredExpenseDraft>;
  } catch {
    window.localStorage.removeItem(EXPENSE_STORAGE_KEY);
    return {} as Record<string, StoredExpenseDraft>;
  }
}

function writeStore(nextValue: Record<string, StoredExpenseDraft>) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(nextValue));
}

export function readExpenseSummaries() {
  return Object.values(readStore())
    .map((draft) => ({
      date: draft.date,
      totalAmount: draft.rows.reduce(
        (sum, row) => sum + parseAmount(row.amount),
        0,
      ),
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

export function readExpenseDraft(date: string) {
  const draft = readStore()[date];

  if (!draft) {
    return null;
  }

  return draft;
}

export function saveExpenseDraft({
  date,
  employeeName,
  note,
  rows,
}: {
  date: string;
  employeeName: string;
  note: string;
  rows: ExpenseRow[];
}) {
  const store = readStore();

  store[date] = {
    date,
    employeeName,
    note,
    rows: rows.map((row) => ({
      id: row.id,
      typeId: row.typeId,
      amount: row.amount,
      remark: row.remark,
      receipts: row.receipts,
    })),
    updatedAt: new Date().toISOString(),
  };

  writeStore(store);
}

export function hydrateRowsFromDraft(draft: ReturnType<typeof readExpenseDraft>) {
  if (!draft || draft.rows.length === 0) {
    return [] as ExpenseRow[];
  }

  return draft.rows.map((row) => ({
    ...row,
    isExpanded: !hasRowContent(row),
    isReceiptPreviewOpen: false,
  }));
}
