import { redirect } from "next/navigation";

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
  const period = readSingleSearchParam(queryParams.period);
  const periodSuffix = period ? `?period=${encodeURIComponent(period)}` : "";

  redirect(`/admin/expenses/${routeParams.userId}${periodSuffix}`);
}
