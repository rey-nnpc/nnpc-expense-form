import {
  buildPublicStorageUrl,
  COMPANY_ASSETS_BUCKET,
  createScopedObjectPath,
  removeStorageObjects,
  SESSION_EXPIRED_MESSAGE,
  supabaseJsonRequest,
  uploadStorageObject,
} from "@/lib/supabase-api";

export type CompanyRecord = {
  id: string;
  companyName: string;
  companyTaxId: string;
  logoUrl: string;
  logoBucketName: string | null;
  logoObjectPath: string | null;
  originalLogoFileName: string | null;
  createdAt: string;
};

type CompanyRow = {
  id: string;
  company_name: string;
  company_tax_id: string | null;
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
    companyTaxId: row.company_tax_id ?? "",
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
    path: "user_companies?select=id,company_name,company_tax_id,logo_data_url,logo_bucket_name,logo_object_path,original_logo_file_name,created_at&order=created_at.desc",
  });

  return rows.map(mapCompanyRow);
}

export async function createUserCompany({
  accessToken,
  companyName,
  companyTaxId,
  logoFile,
}: {
  accessToken: string;
  companyName: string;
  companyTaxId: string;
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
        company_tax_id: companyTaxId.trim() || null,
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
    path: "user_companies?select=id,company_name,company_tax_id,logo_data_url,logo_bucket_name,logo_object_path,original_logo_file_name,created_at",
  });

  const [firstRow] = rows;

  if (!firstRow) {
    throw new Error("Supabase did not return the newly created company.");
  }

  return mapCompanyRow(firstRow);
}

export async function updateUserCompany({
  accessToken,
  companyId,
  companyName,
  companyTaxId,
  currentCompany,
  logoFile,
}: {
  accessToken: string;
  companyId: string;
  companyName: string;
  companyTaxId: string;
  currentCompany: Pick<
    CompanyRecord,
    "id" | "logoBucketName" | "logoObjectPath" | "originalLogoFileName"
  >;
  logoFile?: File | null;
}) {
  let uploadedObjectPath: string | null = null;

  try {
    const nextBody: Record<string, string | null> = {
      company_name: companyName.trim(),
      company_tax_id: companyTaxId.trim() || null,
    };

    if (logoFile) {
      uploadedObjectPath = createScopedObjectPath({
        accessToken,
        fileName: logoFile.name,
        folder: "companies",
      });

      await uploadStorageObject({
        accessToken,
        bucketName: COMPANY_ASSETS_BUCKET,
        contentType: logoFile.type,
        file: logoFile,
        objectPath: uploadedObjectPath,
      });

      nextBody.logo_data_url = null;
      nextBody.logo_bucket_name = COMPANY_ASSETS_BUCKET;
      nextBody.logo_object_path = uploadedObjectPath;
      nextBody.original_logo_file_name = logoFile.name;
    }

    const rows = await supabaseJsonRequest<CompanyRow[]>({
      accessToken,
      body: nextBody,
      headers: {
        Prefer: "return=representation",
      },
      method: "PATCH",
      path: `user_companies?id=eq.${encodeURIComponent(companyId)}&select=id,company_name,company_tax_id,logo_data_url,logo_bucket_name,logo_object_path,original_logo_file_name,created_at`,
    });

    const [firstRow] = rows;

    if (!firstRow) {
      throw new Error("Supabase did not return the updated company.");
    }

    if (
      uploadedObjectPath &&
      currentCompany.logoBucketName &&
      currentCompany.logoObjectPath &&
      currentCompany.logoObjectPath !== uploadedObjectPath
    ) {
      void removeStorageObjects({
        accessToken,
        bucketName: currentCompany.logoBucketName,
        objectPaths: [currentCompany.logoObjectPath],
      }).catch(() => undefined);
    }

    return mapCompanyRow(firstRow);
  } catch (error) {
    if (uploadedObjectPath) {
      void removeStorageObjects({
        accessToken,
        bucketName: COMPANY_ASSETS_BUCKET,
        objectPaths: [uploadedObjectPath],
      }).catch(() => undefined);
    }

    throw error;
  }
}
