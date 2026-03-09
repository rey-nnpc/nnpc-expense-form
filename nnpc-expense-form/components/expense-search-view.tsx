"use client";

import { useSearchParams } from "next/navigation";
import ExpenseEditorView from "@/components/expense-editor-view";
import { getBangkokDateInputValue, isIsoDateValue } from "@/lib/date";

export default function ExpenseSearchView() {
  const searchParams = useSearchParams();
  const requestedDate = searchParams.get("date") ?? "";
  const expenseDate = isIsoDateValue(requestedDate)
    ? requestedDate
    : getBangkokDateInputValue();

  return <ExpenseEditorView expenseDate={expenseDate} key={expenseDate} />;
}
