import {
  deriveUserIdFromAccessToken,
  SESSION_EXPIRED_MESSAGE,
  supabaseJsonRequest,
} from "@/lib/supabase-api";

export type UserProfile = {
  department: string;
  fullName: string;
};

type ProfileRow = {
  department: string | null;
  full_name: string | null;
};

function normalizeProfileRow(row: ProfileRow | null) {
  if (!row) {
    return null;
  }

  return {
    department: row.department?.trim() || "",
    fullName: row.full_name?.trim() || "",
  } satisfies UserProfile;
}

export { SESSION_EXPIRED_MESSAGE };

export async function getUserProfile(accessToken: string) {
  const userId = deriveUserIdFromAccessToken(accessToken);

  if (!userId) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  const rows = await supabaseJsonRequest<ProfileRow[]>({
    accessToken,
    path: `profiles?select=full_name,department&id=eq.${encodeURIComponent(userId)}&limit=1`,
  });

  return normalizeProfileRow(rows[0] ?? null);
}

export async function upsertUserProfile({
  accessToken,
  department,
  fullName,
}: {
  accessToken: string;
  department: string;
  fullName: string;
}) {
  const userId = deriveUserIdFromAccessToken(accessToken);

  if (!userId) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  const rows = await supabaseJsonRequest<ProfileRow[]>({
    accessToken,
    body: [
      {
        department: department.trim() || null,
        full_name: fullName.trim() || null,
        id: userId,
      },
    ],
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    method: "POST",
    path: "profiles?on_conflict=id&select=full_name,department",
  });

  const normalizedProfile = normalizeProfileRow(rows[0] ?? null);

  if (!normalizedProfile) {
    throw new Error("Supabase did not return the saved profile.");
  }

  return normalizedProfile;
}
