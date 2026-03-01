import { notFound } from "next/navigation";
import ExpenseEditorView from "../../../components/expense-editor-view";
import { isIsoDateValue } from "../../../lib/date";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    date: string;
  }>;
};

export default async function ExpenseDatePage({ params }: PageProps) {
  const { date } = await params;

  if (!isIsoDateValue(date)) {
    notFound();
  }

  return <ExpenseEditorView expenseDate={date} key={date} />;
}
