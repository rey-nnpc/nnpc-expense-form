import type { CompanyRecord } from "@/lib/company-data";
import type { ExpenseSummary, ExportLanguage } from "@/lib/expense-data";
import type { ExpenseDayDocument } from "@/lib/report-data";

const CACHE_VERSION = 2;
const COMPANIES_TTL_MS = 30 * 60_000;
const EXPENSE_DAY_TTL_MS = 10 * 60_000;
const EXPENSE_DRAFT_TTL_MS = 24 * 60 * 60_000;
const SUMMARIES_TTL_MS = 10 * 60_000;

type CacheEnvelope<T> = {
  expiresAt: number;
  value: T;
  version: number;
};

export type ExpenseDraftReceiptSnapshot = {
  id: string;
  name: string;
  previewUrl: string;
  sizeLabel: string;
  bucketName?: string;
  objectPath?: string;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
};

export type ExpenseDraftRowSnapshot = {
  id: number;
  typeId: string;
  amount: string;
  remark: string;
  receipts: ExpenseDraftReceiptSnapshot[];
  isExpanded: boolean;
  isReceiptPreviewOpen: boolean;
};

export type ExpenseDraftSnapshot = {
  companyId: string;
  employeeName: string;
  exportLanguage: ExportLanguage;
  note: string;
  rows: ExpenseDraftRowSnapshot[];
};

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeUserKey(userKey: string) {
  return userKey.trim().toLowerCase() || "anonymous";
}

function buildCacheKey(scope: string, userKey: string, suffix?: string) {
  const normalizedUserKey = normalizeUserKey(userKey);

  return [`nnpc-cache`, `v${CACHE_VERSION}`, scope, normalizedUserKey, suffix]
    .filter(Boolean)
    .join(":");
}

function readCacheValue<T>(cacheKey: string) {
  if (!isBrowser()) {
    return null as T | null;
  }

  const rawValue = window.localStorage.getItem(cacheKey);

  if (!rawValue) {
    return null as T | null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as CacheEnvelope<T>;

    if (
      parsedValue.version !== CACHE_VERSION ||
      typeof parsedValue.expiresAt !== "number" ||
      Date.now() > parsedValue.expiresAt
    ) {
      window.localStorage.removeItem(cacheKey);
      return null as T | null;
    }

    return parsedValue.value;
  } catch {
    window.localStorage.removeItem(cacheKey);
    return null as T | null;
  }
}

function writeCacheValue<T>(cacheKey: string, value: T, ttlMs: number) {
  if (!isBrowser()) {
    return;
  }

  const payload = {
    expiresAt: Date.now() + ttlMs,
    value,
    version: CACHE_VERSION,
  } satisfies CacheEnvelope<T>;

  window.localStorage.setItem(cacheKey, JSON.stringify(payload));
}

function sortSummariesByDateDesc(summaries: ExpenseSummary[]) {
  return [...summaries].sort((left, right) => right.date.localeCompare(left.date));
}

export function readCompaniesCache(userKey: string) {
  return readCacheValue<CompanyRecord[]>(buildCacheKey("companies", userKey));
}

export function writeCompaniesCache(userKey: string, companies: CompanyRecord[]) {
  writeCacheValue(buildCacheKey("companies", userKey), companies, COMPANIES_TTL_MS);
}

export function readExpenseSummariesCache(userKey: string) {
  return readCacheValue<ExpenseSummary[]>(buildCacheKey("expense-summaries", userKey));
}

export function writeExpenseSummariesCache(userKey: string, summaries: ExpenseSummary[]) {
  writeCacheValue(
    buildCacheKey("expense-summaries", userKey),
    sortSummariesByDateDesc(summaries),
    SUMMARIES_TTL_MS,
  );
}

export function upsertExpenseSummaryCache(userKey: string, summary: ExpenseSummary) {
  const currentSummaries = readExpenseSummariesCache(userKey) ?? [];
  const nextSummaries = sortSummariesByDateDesc(
    currentSummaries.some((entry) => entry.date === summary.date)
      ? currentSummaries.map((entry) => (entry.date === summary.date ? summary : entry))
      : [summary, ...currentSummaries],
  );

  writeExpenseSummariesCache(userKey, nextSummaries);
}

export function readExpenseDayCache(userKey: string, expenseDate: string) {
  return readCacheValue<ExpenseDayDocument>(buildCacheKey("expense-day", userKey, expenseDate));
}

export function writeExpenseDayCache(
  userKey: string,
  expenseDate: string,
  document: ExpenseDayDocument,
) {
  writeCacheValue(
    buildCacheKey("expense-day", userKey, expenseDate),
    document,
    EXPENSE_DAY_TTL_MS,
  );
}

export function readExpenseDraftCache(userKey: string, expenseDate: string) {
  return readCacheValue<ExpenseDraftSnapshot>(
    buildCacheKey("expense-draft", userKey, expenseDate),
  );
}

export function writeExpenseDraftCache(
  userKey: string,
  expenseDate: string,
  draft: ExpenseDraftSnapshot,
) {
  writeCacheValue(
    buildCacheKey("expense-draft", userKey, expenseDate),
    draft,
    EXPENSE_DRAFT_TTL_MS,
  );
}

export function clearExpenseDraftCache(userKey: string, expenseDate: string) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(buildCacheKey("expense-draft", userKey, expenseDate));
}
