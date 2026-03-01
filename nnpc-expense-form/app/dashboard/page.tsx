import DashboardView from "../../components/dashboard-view";
import { getBangkokDateInputValue } from "../../lib/date";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return <DashboardView defaultExpenseDate={getBangkokDateInputValue()} />;
}
