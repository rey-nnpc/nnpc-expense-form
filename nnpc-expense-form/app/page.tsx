import ExpensePrototype from "../components/expense-prototype";

const dateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());

const year = dateParts.find((part) => part.type === "year")?.value ?? "2026";
const month = dateParts.find((part) => part.type === "month")?.value ?? "03";
const day = dateParts.find((part) => part.type === "day")?.value ?? "01";
const defaultExpenseDate = `${year}-${month}-${day}`;

export default function Home() {
  return <ExpensePrototype defaultExpenseDate={defaultExpenseDate} />;
}
