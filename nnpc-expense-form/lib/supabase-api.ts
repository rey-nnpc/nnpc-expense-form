const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const SESSION_EXPIRED_MESSAGE = "Session expired. Log in again.";
export const COMPANY_ASSETS_BUCKET = "company-assets";
export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";

type SupabaseErrorPayload = {
  error?: string;
  message?: string;
  hint?: string;
  details?: string;
};

function readSupabaseError(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Supabase request failed.";
  }

  const errorPayload = payload as SupabaseErrorPayload;

  return (
    errorPayload.message ??
    errorPayload.error ??
    errorPayload.details ??
    errorPayload.hint ??
    "Supabase request failed."
  );
}

function assertSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase URL or publishable key in .env.local.");
  }
}

function decodeJwtPayload(accessToken: string) {
  const [, payloadSegment] = accessToken.split(".");

  if (!payloadSegment) {
    return null;
  }

  try {
    const paddedSegment = payloadSegment.padEnd(
      payloadSegment.length + ((4 - (payloadSegment.length % 4)) % 4),
      "=",
    );
    const normalizedSegment = paddedSegment.replace(/-/g, "+").replace(/_/g, "/");

    return JSON.parse(globalThis.atob(normalizedSegment)) as {
      sub?: string;
      exp?: number;
    };
  } catch {
    return null;
  }
}

function encodeStoragePath(objectPath: string) {
  return objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function deriveUserIdFromAccessToken(accessToken: string) {
  const payload = decodeJwtPayload(accessToken);

  return typeof payload?.sub === "string" ? payload.sub : null;
}

export function buildPublicStorageUrl(bucketName: string, objectPath: string) {
  assertSupabaseConfig();

  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(bucketName)}/${encodeStoragePath(
    objectPath,
  )}`;
}

export function createScopedObjectPath({
  accessToken,
  fileName,
  folder,
}: {
  accessToken: string;
  fileName: string;
  folder: string;
}) {
  const userId = deriveUserIdFromAccessToken(accessToken);

  if (!userId) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  const sanitizedName =
    fileName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "") || "file";

  return `${userId}/${folder}/${crypto.randomUUID()}-${sanitizedName}`;
}

export async function supabaseJsonRequest<T>({
  accessToken,
  body,
  headers,
  method = "GET",
  path,
}: {
  accessToken: string;
  body?: unknown;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
}) {
  assertSupabaseConfig();

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    throw new Error(readSupabaseError(payload));
  }

  if (payload === null) {
    throw new Error("Supabase returned an empty response.");
  }

  return payload;
}

export async function supabaseRpcRequest<T>({
  accessToken,
  args,
  fn,
}: {
  accessToken: string;
  args: Record<string, unknown>;
  fn: string;
}) {
  return supabaseJsonRequest<T>({
    accessToken,
    body: args,
    method: "POST",
    path: `rpc/${fn}`,
  });
}

export async function supabaseStorageJsonRequest<T>({
  accessToken,
  body,
  headers,
  method = "POST",
  path,
}: {
  accessToken: string;
  body?: unknown;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
}) {
  assertSupabaseConfig();

  const response = await fetch(`${SUPABASE_URL}/storage/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    throw new Error(readSupabaseError(payload));
  }

  if (payload === null) {
    throw new Error("Supabase returned an empty response.");
  }

  return payload;
}

export async function removeStorageObjects({
  accessToken,
  bucketName,
  objectPaths,
}: {
  accessToken: string;
  bucketName: string;
  objectPaths: string[];
}) {
  if (objectPaths.length === 0) {
    return [] as Array<{
      name?: string;
    }>;
  }

  return supabaseStorageJsonRequest<Array<{ name?: string }>>({
    accessToken,
    body: {
      prefixes: objectPaths,
    },
    method: "DELETE",
    path: `object/${encodeURIComponent(bucketName)}`,
  });
}

export async function uploadStorageObject({
  accessToken,
  bucketName,
  contentType,
  file,
  objectPath,
  upsert = false,
}: {
  accessToken: string;
  bucketName: string;
  contentType?: string;
  file: Blob;
  objectPath: string;
  upsert?: boolean;
}) {
  assertSupabaseConfig();

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucketName)}/${encodeStoragePath(
      objectPath,
    )}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType || "application/octet-stream",
        "x-upsert": upsert ? "true" : "false",
      },
      body: file,
    },
  );

  const payload = (await response.json().catch(() => null)) as SupabaseErrorPayload | null;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    throw new Error(readSupabaseError(payload));
  }
}
