import { getBangkokDateInputValue } from "@/lib/date";
import { supabaseRpcRequest } from "@/lib/supabase-api";

export type AdminExpenseDay = {
  companyName: string;
  date: string;
  employeeName: string;
  expenseCode: string;
  reportId: string;
  totalAmount: number;
};

export type AdminExpenseUserSummary = {
  displayName: string;
  email: string;
  monthDaysWithExpenses: number;
  monthlyExpense: number;
  userId: string;
  yearlyExpense: number;
};

export type AdminExpenseUserDetail = AdminExpenseUserSummary & {
  detailRows: AdminExpenseDay[];
};

export type AdminExpenseDashboard = {
  periodLabel: string;
  selectedMonth: number;
  selectedPeriod: string;
  selectedYear: number;
  totals: {
    monthlyExpense: number;
    usersWithMonthlyExpenses: number;
    yearlyExpense: number;
  };
  users: AdminExpenseUserSummary[];
};

export type AdminExpenseUserDetailResponse = {
  periodLabel: string;
  selectedMonth: number;
  selectedPeriod: string;
  selectedYear: number;
  user: AdminExpenseUserDetail | null;
};

type SummaryUserPayload = {
  displayName?: string;
  email?: string;
  monthDaysWithExpenses?: number | string;
  monthlyExpense?: number | string;
  userId?: string;
  yearlyExpense?: number | string;
};

type AdminExpenseDashboardPayload = {
  selectedMonth?: number | string;
  selectedPeriod?: string;
  selectedYear?: number | string;
  totals?: {
    monthlyExpense?: number | string;
    usersWithMonthlyExpenses?: number | string;
    yearlyExpense?: number | string;
  } | null;
  users?: SummaryUserPayload[] | null;
};

type AdminExpenseUserDetailPayload = {
  selectedMonth?: number | string;
  selectedPeriod?: string;
  selectedYear?: number | string;
  user?: {
    detailRows?: Array<{
      companyName?: string;
      date?: string;
      employeeName?: string;
      expenseCode?: string;
      reportId?: string;
      totalAmount?: number | string;
    }> | null;
    displayName?: string;
    email?: string;
    monthDaysWithExpenses?: number | string;
    monthlyExpense?: number | string;
    userId?: string;
    yearlyExpense?: number | string;
  } | null;
};

function toNumber(value: number | string | undefined | null) {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeExpenseUserSummary(user: SummaryUserPayload, userIndex = 0) {
  return {
    displayName: user.displayName?.trim() || "Expense owner",
    email: user.email?.trim() || "No email",
    monthDaysWithExpenses: toNumber(user.monthDaysWithExpenses),
    monthlyExpense: toNumber(user.monthlyExpense),
    userId: user.userId?.trim() || `user-${userIndex + 1}`,
    yearlyExpense: toNumber(user.yearlyExpense),
  } satisfies AdminExpenseUserSummary;
}

export function getDefaultAdminPeriod() {
  return getBangkokDateInputValue().slice(0, 7);
}

export function normalizeAdminPeriod(rawPeriod?: string | null) {
  const fallbackPeriod = getDefaultAdminPeriod();

  if (!rawPeriod || !/^\d{4}-\d{2}$/.test(rawPeriod)) {
    return fallbackPeriod;
  }

  const year = Number(rawPeriod.slice(0, 4));
  const month = Number(rawPeriod.slice(5, 7));

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return fallbackPeriod;
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return fallbackPeriod;
  }

  return rawPeriod;
}

export function formatAdminPeriodLabel(period: string) {
  const normalizedPeriod = normalizeAdminPeriod(period);
  const parsedDate = new Date(`${normalizedPeriod}-01T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return normalizedPeriod;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

export async function getAdminExpenseDashboard(accessToken: string, period: string) {
  const normalizedPeriod = normalizeAdminPeriod(period);
  const payload = await supabaseRpcRequest<AdminExpenseDashboardPayload>({
    accessToken,
    args: {
      p_period: normalizedPeriod,
    },
    fn: "get_admin_expense_dashboard",
  });

  const selectedPeriod = normalizeAdminPeriod(payload.selectedPeriod ?? normalizedPeriod);
  const selectedYear = toNumber(payload.selectedYear) || Number(selectedPeriod.slice(0, 4));
  const selectedMonth = toNumber(payload.selectedMonth) || Number(selectedPeriod.slice(5, 7));

  return {
    periodLabel: formatAdminPeriodLabel(selectedPeriod),
    selectedMonth,
    selectedPeriod,
    selectedYear,
    totals: {
      monthlyExpense: toNumber(payload.totals?.monthlyExpense),
      usersWithMonthlyExpenses: toNumber(payload.totals?.usersWithMonthlyExpenses),
      yearlyExpense: toNumber(payload.totals?.yearlyExpense),
    },
    users: (payload.users ?? []).map((user, userIndex) =>
      normalizeExpenseUserSummary(user, userIndex),
    ),
  } satisfies AdminExpenseDashboard;
}

export async function getAdminExpenseUserDetail(
  accessToken: string,
  period: string,
  userId: string,
) {
  const normalizedPeriod = normalizeAdminPeriod(period);
  const payload = await supabaseRpcRequest<AdminExpenseUserDetailPayload>({
    accessToken,
    args: {
      p_period: normalizedPeriod,
      p_user_id: userId,
    },
    fn: "get_admin_expense_user_detail",
  });

  const selectedPeriod = normalizeAdminPeriod(payload.selectedPeriod ?? normalizedPeriod);
  const selectedYear = toNumber(payload.selectedYear) || Number(selectedPeriod.slice(0, 4));
  const selectedMonth = toNumber(payload.selectedMonth) || Number(selectedPeriod.slice(5, 7));
  const userPayload = payload.user ?? null;
  const selectedUser = userPayload
    ? {
        ...normalizeExpenseUserSummary(userPayload),
        detailRows: (userPayload.detailRows ?? []).map((detailRow, detailIndex) => ({
          companyName: detailRow.companyName?.trim() || "No company",
          date: detailRow.date?.trim() || "",
          employeeName: detailRow.employeeName?.trim() || "Expense owner",
          expenseCode: detailRow.expenseCode?.trim() || "EXP",
          reportId:
            detailRow.reportId?.trim() ||
            `detail-${userPayload.userId?.trim() || userId}-${detailIndex + 1}`,
          totalAmount: toNumber(detailRow.totalAmount),
        })),
      }
    : null;

  return {
    periodLabel: formatAdminPeriodLabel(selectedPeriod),
    selectedMonth,
    selectedPeriod,
    selectedYear,
    user: selectedUser,
  } satisfies AdminExpenseUserDetailResponse;
}
