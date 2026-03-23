import AdminUserDetailView from "@/components/admin-user-detail-view";
import { normalizeAdminPeriod } from "@/lib/admin-data";

type AdminExpenseUserDetailPageProps = {
  params: Promise<{
    userId: string;
  }>;
  searchParams?: Promise<{
    period?: string | string[];
  }>;
};

function readSingleSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminExpenseUserDetailPage({
  params,
  searchParams,
}: AdminExpenseUserDetailPageProps) {
  const routeParams = await params;
  const queryParams = (await searchParams) ?? {};
  const initialPeriod = normalizeAdminPeriod(readSingleSearchParam(queryParams.period));

  return <AdminUserDetailView initialPeriod={initialPeriod} userId={routeParams.userId} />;
}
