const MONTH_CODES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

export function getBangkokDateInputValue() {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = dateParts.find((part) => part.type === "year")?.value ?? "2026";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "03";
  const day = dateParts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(value: string) {
  if (!value) {
    return "No date selected";
  }

  const parsedDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
  }).format(parsedDate);
}

export function formatExpenseReferenceCode(value: string) {
  if (!isIsoDateValue(value)) {
    return "EXP";
  }

  const [year, month, day] = value.split("-");
  const monthIndex = Number(month) - 1;
  const monthCode = MONTH_CODES[monthIndex];

  if (!year || !day || !monthCode) {
    return "EXP";
  }

  return `EXP-${day}${monthCode}${year}`;
}

export function formatExpenseLineReferenceCode(value: string, lineNumber: number) {
  const normalizedLineNumber = Number.isFinite(lineNumber) ? Math.max(1, lineNumber) : 1;

  return `${formatExpenseReferenceCode(value)}-${String(normalizedLineNumber).padStart(2, "0")}`;
}

export function isIsoDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
