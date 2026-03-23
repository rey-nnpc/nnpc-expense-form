import AdminControlCenterView from "@/components/admin-control-center-view";

type AdminUsersPageProps = {
  searchParams?: Promise<{
    tab?: string | string[];
  }>;
};

function readSingleSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const params = (await searchParams) ?? {};

  return <AdminControlCenterView initialTab={readSingleSearchParam(params.tab)} />;
}
