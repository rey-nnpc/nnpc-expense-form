import {
  buildPublicStorageUrl,
  createScopedObjectPath,
  EXPENSE_RECEIPTS_BUCKET,
  supabaseJsonRequest,
  supabaseRpcRequest,
  uploadStorageObject,
} from "@/lib/supabase-api";
import {
  EXPENSE_TYPES,
  formatFileSize,
  hasRowContent,
  type ExpenseRow,
  type ExpenseSummary,
  type ExportLanguage,
  type ReceiptDraft,
} from "@/lib/expense-data";

type ExpenseSummaryRow = {
  expense_date: string;
  total_amount_thb: number | string;
};

type ReceiptRow = {
  id: string;
  bucket_name: string;
  object_path: string;
  original_file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
};

type ExpenseItemRow = {
  id: string;
  expense_type_label: string;
  amount_thb: number | string;
  remark: string | null;
  line_number: number;
  expense_receipts: ReceiptRow[] | null;
};

type ExpenseReportRow = {
  id: string;
  company_id: string | null;
  company_name: string | null;
  company_logo_data_url: string | null;
  company_logo_bucket_name: string | null;
  company_logo_object_path: string | null;
  export_language: ExportLanguage | null;
  employee_name: string | null;
  note: string | null;
  expense_items: ExpenseItemRow[] | null;
};

export type ExpenseDayDocument = {
  reportId: string;
  companyId: string;
  companyName: string;
  companyLogoBucketName: string;
  companyLogoObjectPath: string;
  companyLogoUrl: string;
  employeeName: string;
  exportLanguage: ExportLanguage;
  note: string;
  rows: ExpenseRow[];
};

function buildReceiptDraftFromRow(row: ReceiptRow): ReceiptDraft {
  return {
    id: row.id,
    name: row.original_file_name,
    previewUrl: buildPublicStorageUrl(row.bucket_name, row.object_path),
    sizeLabel:
      typeof row.file_size_bytes === "number"
        ? formatFileSize(row.file_size_bytes)
        : "Saved receipt",
    bucketName: row.bucket_name,
    objectPath: row.object_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
  };
}

function buildExpenseRowFromRow(row: ExpenseItemRow, index: number): ExpenseRow {
  const typeId =
    EXPENSE_TYPES.find((expenseType) => expenseType.label === row.expense_type_label)?.id ??
    "misc";

  return {
    id: index + 1,
    typeId,
    amount: String(row.amount_thb),
    remark: row.remark ?? "",
    receipts: (row.expense_receipts ?? []).map(buildReceiptDraftFromRow),
    isExpanded: false,
    isReceiptPreviewOpen: false,
  };
}

async function materializeReceipts({
  accessToken,
  expenseDate,
  rows,
}: {
  accessToken: string;
  expenseDate: string;
  rows: ExpenseRow[];
}) {
  let didUpload = false;

  const nextRows = await Promise.all(
    rows.map(async (row) => {
      const nextReceipts = await Promise.all(
        row.receipts.map(async (receipt) => {
          if (!receipt.file || receipt.objectPath) {
            return receipt;
          }

          const objectPath = createScopedObjectPath({
            accessToken,
            fileName: receipt.name,
            folder: `expense-receipts/${expenseDate}/expense-${String(row.id).padStart(2, "0")}`,
          });

          await uploadStorageObject({
            accessToken,
            bucketName: EXPENSE_RECEIPTS_BUCKET,
            contentType: receipt.file.type,
            file: receipt.file,
            objectPath,
          });

          didUpload = true;

          return {
            ...receipt,
            bucketName: EXPENSE_RECEIPTS_BUCKET,
            objectPath,
            previewUrl: buildPublicStorageUrl(EXPENSE_RECEIPTS_BUCKET, objectPath),
            mimeType: receipt.file.type || receipt.mimeType || null,
            fileSizeBytes: receipt.file.size,
            sizeLabel: formatFileSize(receipt.file.size),
            file: undefined,
          } satisfies ReceiptDraft;
        }),
      );

      return {
        ...row,
        receipts: nextReceipts,
      };
    }),
  );

  return {
    didUpload,
    rows: nextRows,
  };
}

export async function listExpenseSummaries(accessToken: string) {
  const rows = await supabaseJsonRequest<ExpenseSummaryRow[]>({
    accessToken,
    path: "expense_reports?select=expense_date,total_amount_thb&order=expense_date.desc",
  });

  return rows.map(
    (row) =>
      ({
        date: row.expense_date,
        totalAmount: Number(row.total_amount_thb),
      }) satisfies ExpenseSummary,
  );
}

export async function getExpenseDay(accessToken: string, expenseDate: string) {
  const rows = await supabaseJsonRequest<ExpenseReportRow[]>({
    accessToken,
    path: `expense_reports?select=id,company_id,company_name,company_logo_data_url,company_logo_bucket_name,company_logo_object_path,export_language,employee_name,note,expense_items(id,expense_type_label,amount_thb,remark,line_number,expense_receipts(id,bucket_name,object_path,original_file_name,mime_type,file_size_bytes))&expense_date=eq.${expenseDate}&limit=1`,
  });

  const [report] = rows;

  if (!report) {
    return null;
  }

  const sortedItems = [...(report.expense_items ?? [])].sort(
    (left, right) => left.line_number - right.line_number,
  );
  const companyLogoBucketName = report.company_logo_bucket_name ?? "";
  const companyLogoObjectPath = report.company_logo_object_path ?? "";

  return {
    reportId: report.id,
    companyId: report.company_id ?? "",
    companyName: report.company_name ?? "",
    companyLogoBucketName,
    companyLogoObjectPath,
    companyLogoUrl:
      companyLogoBucketName && companyLogoObjectPath
        ? buildPublicStorageUrl(companyLogoBucketName, companyLogoObjectPath)
        : report.company_logo_data_url ?? "",
    employeeName: report.employee_name ?? "",
    exportLanguage: report.export_language === "th" ? "th" : "en",
    note: report.note ?? "",
    rows:
      sortedItems.length > 0
        ? sortedItems.map(buildExpenseRowFromRow)
        : ([] as ExpenseRow[]),
  } satisfies ExpenseDayDocument;
}

export async function upsertExpenseDay({
  accessToken,
  companyId,
  companyLogoBucketName,
  companyLogoObjectPath,
  companyName,
  employeeName,
  expenseDate,
  exportLanguage,
  note,
  rows,
}: {
  accessToken: string;
  companyId: string;
  companyLogoBucketName: string;
  companyLogoObjectPath: string;
  companyName: string;
  employeeName: string;
  expenseDate: string;
  exportLanguage: ExportLanguage;
  note: string;
  rows: ExpenseRow[];
}) {
  const { didUpload, rows: materializedRows } = await materializeReceipts({
    accessToken,
    expenseDate,
    rows,
  });

  const persistedRows = materializedRows.filter(hasRowContent);

  const reportId = await supabaseRpcRequest<string>({
    accessToken,
    args: {
      p_company_id: companyId || null,
      p_company_logo_bucket_name: companyLogoBucketName || null,
      p_company_logo_object_path: companyLogoObjectPath || null,
      p_company_name: companyName.trim() || null,
      p_employee_name: employeeName.trim() || null,
      p_expense_date: expenseDate,
      p_export_language: exportLanguage,
      p_items: persistedRows.map((row, index) => ({
        amount_thb: Number(row.amount),
        line_number: index + 1,
        receipts: row.receipts
          .filter((receipt) => receipt.bucketName && receipt.objectPath)
          .map((receipt) => ({
            bucket_name: receipt.bucketName,
            file_size_bytes: receipt.fileSizeBytes ?? null,
            mime_type: receipt.mimeType ?? null,
            object_path: receipt.objectPath,
            original_file_name: receipt.name,
          })),
        remark: row.remark.trim() || null,
        type_code: row.typeId,
      })),
      p_note: note.trim() || null,
    },
    fn: "upsert_expense_day",
  });

  return {
    didUpload,
    reportId,
    rows: didUpload
      ? materializedRows.map((row) => ({
          ...row,
          receipts: row.receipts.map((receipt) => ({
            ...receipt,
            file: undefined,
          })),
        }))
      : materializedRows,
  };
}

export function buildRowsFromLoadedReport(rows: ExpenseRow[]) {
  if (rows.length === 0) {
    return [] as ExpenseRow[];
  }

  return rows.map((row) => ({
    ...row,
    isExpanded: !hasRowContent(row),
    isReceiptPreviewOpen: false,
  }));
}
