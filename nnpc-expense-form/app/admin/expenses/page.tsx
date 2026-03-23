import AdminDashboardView from "@/components/admin-dashboard-view";
import { normalizeAdminPeriod } from "@/lib/admin-data";

type AdminExpensesPageProps = {
  searchParams?: Promise<{
    period?: string | string[];
  }>;
};

function readSingleSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminExpensesPage({
  searchParams,
}: AdminExpensesPageProps) {
  const params = (await searchParams) ?? {};
  const initialPeriod = normalizeAdminPeriod(readSingleSearchParam(params.period));

  return <AdminDashboardView initialPeriod={initialPeriod} />;
}
