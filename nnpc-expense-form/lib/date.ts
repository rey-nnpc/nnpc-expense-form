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

export function isIsoDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
