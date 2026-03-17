import AdminUserDetailView from "@/components/admin-user-detail-view";
import { normalizeAdminPeriod } from "@/lib/admin-data";

type AdminUserDetailPageProps = {
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

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: AdminUserDetailPageProps) {
  const routeParams = await params;
  const queryParams = (await searchParams) ?? {};
  const initialPeriod = normalizeAdminPeriod(readSingleSearchParam(queryParams.period));

  return <AdminUserDetailView initialPeriod={initialPeriod} userId={routeParams.userId} />;
}
