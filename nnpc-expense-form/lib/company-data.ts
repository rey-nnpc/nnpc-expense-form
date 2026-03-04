import {
  buildPublicStorageUrl,
  COMPANY_ASSETS_BUCKET,
  createScopedObjectPath,
  SESSION_EXPIRED_MESSAGE,
  supabaseJsonRequest,
  uploadStorageObject,
} from "@/lib/supabase-api";

export type CompanyRecord = {
  id: string;
  companyName: string;
  logoUrl: string;
  logoBucketName: string | null;
  logoObjectPath: string | null;
  originalLogoFileName: string | null;
  createdAt: string;
};

type CompanyRow = {
  id: string;
  company_name: string;
  logo_data_url: string | null;
  logo_bucket_name: string | null;
  logo_object_path: string | null;
  original_logo_file_name: string | null;
  created_at: string;
};

function mapCompanyRow(row: CompanyRow): CompanyRecord {
  const logoBucketName = row.logo_bucket_name;
  const logoObjectPath = row.logo_object_path;

  return {
    id: row.id,
    companyName: row.company_name,
    logoUrl:
      logoBucketName && logoObjectPath
        ? buildPublicStorageUrl(logoBucketName, logoObjectPath)
        : row.logo_data_url ?? "",
    logoBucketName,
    logoObjectPath,
    originalLogoFileName: row.original_logo_file_name,
    createdAt: row.created_at,
  };
}

export { SESSION_EXPIRED_MESSAGE };

export async function listUserCompanies(accessToken: string) {
  const rows = await supabaseJsonRequest<CompanyRow[]>({
    accessToken,
    path: "user_companies?select=id,company_name,logo_data_url,logo_bucket_name,logo_object_path,original_logo_file_name,created_at&order=created_at.desc",
  });

  return rows.map(mapCompanyRow);
}

export async function createUserCompany({
  accessToken,
  companyName,
  logoFile,
}: {
  accessToken: string;
  companyName: string;
  logoFile: File;
}) {
  const objectPath = createScopedObjectPath({
    accessToken,
    fileName: logoFile.name,
    folder: "companies",
  });

  await uploadStorageObject({
    accessToken,
    bucketName: COMPANY_ASSETS_BUCKET,
    contentType: logoFile.type,
    file: logoFile,
    objectPath,
  });

  const rows = await supabaseJsonRequest<CompanyRow[]>({
    accessToken,
    body: [
      {
        company_name: companyName.trim(),
        logo_data_url: null,
        logo_bucket_name: COMPANY_ASSETS_BUCKET,
        logo_object_path: objectPath,
        original_logo_file_name: logoFile.name,
      },
    ],
    headers: {
      Prefer: "return=representation",
    },
    method: "POST",
    path: "user_companies?select=id,company_name,logo_data_url,logo_bucket_name,logo_object_path,original_logo_file_name,created_at",
  });

  const [firstRow] = rows;

  if (!firstRow) {
    throw new Error("Supabase did not return the newly created company.");
  }

  return mapCompanyRow(firstRow);
}
