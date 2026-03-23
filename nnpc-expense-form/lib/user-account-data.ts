import {
  deriveUserIdFromAccessToken,
  removeStorageObjects,
  supabaseJsonRequest,
  supabaseRpcRequest,
} from "@/lib/supabase-api";

export type AccessStatus = "approved" | "disabled" | "pending";
export type AccountRole = "admin" | "central_admin" | "user";
export type AssignableRole = "admin" | "user";

export type UserAccount = {
  accessStatus: AccessStatus;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  disabledAt: string | null;
  disabledBy: string | null;
  displayName: string;
  email: string;
  role: AccountRole;
  updatedAt: string;
  userId: string;
};

export type AdminUserManagementData = {
  totals: {
    approvedUsers: number;
    disabledUsers: number;
    elevatedUsers: number;
    pendingUsers: number;
  };
  users: UserAccount[];
};

type UserAccountPayload = {
  accessStatus?: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  createdAt?: string;
  disabledAt?: string | null;
  disabledBy?: string | null;
  displayName?: string;
  email?: string;
  role?: string;
  updatedAt?: string;
  userId?: string;
};

type UserAccountRowPayload = {
  access_status?: string;
  approved_at?: string | null;
  approved_by?: string | null;
  created_at?: string;
  disabled_at?: string | null;
  disabled_by?: string | null;
  display_name?: string;
  email?: string;
  role?: string;
  updated_at?: string;
  user_id?: string;
};

type AdminUserManagementPayload = {
  totals?: {
    approvedUsers?: number | string;
    disabledUsers?: number | string;
    elevatedUsers?: number | string;
    pendingUsers?: number | string;
  } | null;
  users?: UserAccountPayload[] | null;
};

type AdminUserStorageCleanupPayload = {
  companyAssetPaths?: string[] | null;
  expenseReceiptPaths?: string[] | null;
};

const USER_ACCOUNT_SELECT =
  "user_id,email,display_name,role,access_status,created_at,updated_at,approved_at,approved_by,disabled_at,disabled_by";
const STORAGE_DELETE_BATCH_SIZE = 100;

function toNumber(value: number | string | undefined | null) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeAccessStatus(rawStatus?: string | null): AccessStatus {
  if (rawStatus === "approved" || rawStatus === "disabled") {
    return rawStatus;
  }

  return "pending";
}

function normalizeRole(rawRole?: string | null): AccountRole {
  if (rawRole === "admin" || rawRole === "central_admin") {
    return rawRole;
  }

  return "user";
}

function normalizeObjectPaths(rawPaths?: string[] | null) {
  return Array.from(
    new Set(
      (rawPaths ?? [])
        .map((path) => path?.trim() ?? "")
        .filter((path) => path.length > 0),
    ),
  );
}

function chunkObjectPaths(objectPaths: string[]) {
  const batches: string[][] = [];

  for (let index = 0; index < objectPaths.length; index += STORAGE_DELETE_BATCH_SIZE) {
    batches.push(objectPaths.slice(index, index + STORAGE_DELETE_BATCH_SIZE));
  }

  return batches;
}

function normalizeUserAccount(payload: UserAccountPayload | UserAccountRowPayload) {
  const userId =
    "userId" in payload
      ? payload.userId?.trim()
      : "user_id" in payload
        ? payload.user_id?.trim()
        : "";
  const displayName =
    "displayName" in payload ? payload.displayName : "display_name" in payload ? payload.display_name : "";
  const email = "email" in payload ? payload.email : "";
  const role = "role" in payload ? payload.role : "";
  const accessStatus =
    "accessStatus" in payload
      ? payload.accessStatus
      : "access_status" in payload
        ? payload.access_status
        : "";
  const createdAt =
    "createdAt" in payload ? payload.createdAt : "created_at" in payload ? payload.created_at : "";
  const updatedAt =
    "updatedAt" in payload ? payload.updatedAt : "updated_at" in payload ? payload.updated_at : "";
  const approvedAt =
    "approvedAt" in payload ? payload.approvedAt : "approved_at" in payload ? payload.approved_at : null;
  const approvedBy =
    "approvedBy" in payload ? payload.approvedBy : "approved_by" in payload ? payload.approved_by : null;
  const disabledAt =
    "disabledAt" in payload ? payload.disabledAt : "disabled_at" in payload ? payload.disabled_at : null;
  const disabledBy =
    "disabledBy" in payload ? payload.disabledBy : "disabled_by" in payload ? payload.disabled_by : null;

  return {
    accessStatus: normalizeAccessStatus(accessStatus),
    approvedAt: approvedAt?.trim() || null,
    approvedBy: approvedBy?.trim() || null,
    createdAt: createdAt?.trim() || "",
    disabledAt: disabledAt?.trim() || null,
    disabledBy: disabledBy?.trim() || null,
    displayName: displayName?.trim() || "Expense owner",
    email: email?.trim() || "No email",
    role: normalizeRole(role),
    updatedAt: updatedAt?.trim() || "",
    userId: userId || crypto.randomUUID(),
  } satisfies UserAccount;
}

async function fetchOwnUserAccount(accessToken: string) {
  const userId = deriveUserIdFromAccessToken(accessToken);

  if (!userId) {
    throw new Error("Session expired. Log in again.");
  }

  const rows = await supabaseJsonRequest<UserAccountRowPayload[]>({
    accessToken,
    path: `user_accounts?select=${encodeURIComponent(
      USER_ACCOUNT_SELECT,
    )}&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  });

  return rows[0] ? normalizeUserAccount(rows[0]) : null;
}

export async function getCurrentUserAccount(accessToken: string) {
  const backoffDelaysMs = [0, 250, 800];

  for (const delayMs of backoffDelaysMs) {
    if (delayMs > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, delayMs);
      });
    }

    const account = await fetchOwnUserAccount(accessToken);

    if (account) {
      return account;
    }
  }

  throw new Error("Your account record is not ready yet. Try again in a moment.");
}

export async function getAdminUserManagement(accessToken: string) {
  const payload = await supabaseRpcRequest<AdminUserManagementPayload>({
    accessToken,
    args: {},
    fn: "get_admin_user_management",
  });

  return {
    totals: {
      approvedUsers: toNumber(payload.totals?.approvedUsers),
      disabledUsers: toNumber(payload.totals?.disabledUsers),
      elevatedUsers: toNumber(payload.totals?.elevatedUsers),
      pendingUsers: toNumber(payload.totals?.pendingUsers),
    },
    users: (payload.users ?? []).map((user) => normalizeUserAccount(user)),
  } satisfies AdminUserManagementData;
}

export async function adminManageUserAccount({
  accessToken,
  action,
  role,
  targetUserId,
}: {
  accessToken: string;
  action: "approve" | "delete" | "disable" | "set_role";
  role?: AssignableRole;
  targetUserId: string;
}) {
  return supabaseRpcRequest<{
    action?: string;
    userId?: string;
  }>({
    accessToken,
    args: {
      p_action: action,
      p_role: role ?? null,
      p_target_user_id: targetUserId,
    },
    fn: "admin_manage_user_account",
  });
}

export async function deleteAdminUserStorageAssets(
  accessToken: string,
  targetUserId: string,
) {
  const payload = await supabaseRpcRequest<AdminUserStorageCleanupPayload>({
    accessToken,
    args: {
      p_target_user_id: targetUserId,
    },
    fn: "get_admin_user_storage_cleanup",
  });

  const companyAssetPaths = normalizeObjectPaths(payload.companyAssetPaths);
  const expenseReceiptPaths = normalizeObjectPaths(payload.expenseReceiptPaths);

  for (const batch of chunkObjectPaths(companyAssetPaths)) {
    await removeStorageObjects({
      accessToken,
      bucketName: "company-assets",
      objectPaths: batch,
    });
  }

  for (const batch of chunkObjectPaths(expenseReceiptPaths)) {
    await removeStorageObjects({
      accessToken,
      bucketName: "expense-receipts",
      objectPaths: batch,
    });
  }
}
