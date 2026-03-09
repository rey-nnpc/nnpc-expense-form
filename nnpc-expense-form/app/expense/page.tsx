import { Suspense } from "react";
import ExpenseSearchView from "@/components/expense-search-view";

export default function ExpensePage() {
  return (
    <Suspense fallback={null}>
      <ExpenseSearchView />
    </Suspense>
  );
}
