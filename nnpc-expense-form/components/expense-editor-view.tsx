"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import AuthGate, { type AuthSession } from "./auth-gate";
import { formatDisplayDate } from "../lib/date";
import {
  EXPENSE_TYPES,
  buildRemarkSummary,
  createEmptyRow,
  deriveDisplayName,
  findExpenseTypeLabel,
  formatCurrency,
  formatFileSize,
  hasRowContent,
  hydrateRowsFromDraft,
  parseAmount,
  readExpenseDraft,
  saveExpenseDraft,
  type ExpenseRow,
  type ReceiptDraft,
} from "../lib/expense-data";

export default function ExpenseEditorView({
  expenseDate,
}: {
  expenseDate: string;
}) {
  return (
    <AuthGate>
      {({ session, logout }) => (
        <ProtectedExpenseEditor
          expenseDate={expenseDate}
          logout={logout}
          session={session}
        />
      )}
    </AuthGate>
  );
}

async function toReceiptDrafts(rowId: number, files: FileList | null) {
  const fileEntries = Array.from(files ?? []);

  return Promise.all(
    fileEntries.map(async (file, index) => ({
      id: `${rowId}-${index}-${file.name}`,
      name: file.name,
      previewUrl: await readFileAsDataUrl(file),
      sizeLabel: formatFileSize(file.size),
    })),
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("File preview failed."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("File preview failed."));
    };

    reader.readAsDataURL(file);
  });
}

function ProtectedExpenseEditor({
  expenseDate,
  logout,
  session,
}: {
  expenseDate: string;
  logout: () => Promise<void>;
  session: AuthSession;
}) {
  const [initialDraft] = useState(() => readExpenseDraft(expenseDate));
  const [employeeName, setEmployeeName] = useState(
    () =>
      initialDraft?.employeeName || deriveDisplayName(session.userEmail),
  );
  const [note, setNote] = useState(() => initialDraft?.note ?? "");
  const [rows, setRows] = useState<ExpenseRow[]>(
    () => hydrateRowsFromDraft(initialDraft),
  );
  const [lastPrintedAt, setLastPrintedAt] = useState<string | null>(null);

  useEffect(() => {
    saveExpenseDraft({
      date: expenseDate,
      employeeName,
      note,
      rows,
    });
  }, [employeeName, expenseDate, note, rows]);

  const populatedRows = rows.filter(hasRowContent);
  const totalAmount = rows.reduce((sum, row) => sum + parseAmount(row.amount), 0);
  const totalReceipts = rows.reduce((sum, row) => sum + row.receipts.length, 0);

  const updateRow = <K extends keyof ExpenseRow,>(
    rowId: number,
    key: K,
    value: ExpenseRow[K],
  ) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: value,
            }
          : row,
      ),
    );
  };

  const addRow = () => {
    startTransition(() => {
      setRows((currentRows) => {
        const nextId =
          currentRows.length === 0
            ? 1
            : Math.max(...currentRows.map((row) => row.id)) + 1;

        return [...currentRows, createEmptyRow(nextId)];
      });
    });
  };

  const removeRow = (rowId: number) => {
    startTransition(() => {
      setRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
    });
  };

  const toggleExpanded = (rowId: number) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              isExpanded: !row.isExpanded,
            }
          : row,
      ),
    );
  };

  const toggleReceiptPreview = (rowId: number) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              isReceiptPreviewOpen: !row.isReceiptPreviewOpen,
            }
          : row,
      ),
    );
  };

  const handleReceiptChange = async (rowId: number, files: FileList | null) => {
    let nextReceipts: ReceiptDraft[];

    try {
      nextReceipts = await toReceiptDrafts(rowId, files);
    } catch {
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              receipts: nextReceipts,
              isReceiptPreviewOpen: nextReceipts.length > 0,
            }
          : row,
      ),
    );
  };

  const handlePrint = () => {
    const printedAt = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());

    setLastPrintedAt(printedAt);
    window.print();
  };

  return (
    <div className="page-shell min-h-screen">
      <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-8 lg:py-8">
        <section className="screen-only">
          <header className="flex flex-col gap-5 border-b border-[var(--line)] pb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                  Expense day
                </p>
                <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                  {formatDisplayDate(expenseDate)}
                </h1>
                <p className="text-sm text-[var(--muted)]">
                  All rows in this route belong to this date only.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface)]"
                  type="button"
                  onClick={handlePrint}
                >
                  Print / PDF
                </button>
                <button
                  className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                  type="button"
                  onClick={() => {
                    void logout();
                  }}
                >
                  Log out
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-[1.5rem] border border-[var(--line)] bg-[var(--card)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[var(--foreground)]">
                  {employeeName || deriveDisplayName(session.userEmail)}
                </span>
                <span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[var(--muted)]">
                  {rows.length} expense{rows.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-[var(--muted)]">
                  {totalReceipts} receipt{totalReceipts === 1 ? "" : "s"}
                </span>
                <span className="rounded-full bg-[var(--foreground)] px-3 py-1.5 text-white">
                  {formatCurrency(totalAmount)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  className="rounded-2xl border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                  href="/dashboard"
                >
                  Back to dashboard
                </Link>
                <button
                  className="rounded-2xl bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-92"
                  type="button"
                  onClick={addRow}
                >
                  + Create expense
                </button>
              </div>
            </div>
          </header>

          <main className="mt-6 space-y-6">
            <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)]">
              <div className="border-b border-[var(--line)] px-5 py-4">
                <h2 className="text-base font-semibold text-[var(--foreground)]">
                  Expenses
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Collapsed rows keep the day compact.
                </p>
              </div>

              {rows.length === 0 ? (
                <div className="px-5 py-12 text-sm text-[var(--muted)]">
                  No expenses yet. Use{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    Create expense
                  </span>
                  .
                </div>
              ) : (
                <div className="divide-y divide-[var(--line)] px-5">
                  {rows.map((row) => (
                    <article className="py-4" key={row.id}>
                      <button
                        className="flex w-full items-start justify-between gap-4 text-left"
                        type="button"
                        onClick={() => toggleExpanded(row.id)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--foreground)]">
                              {findExpenseTypeLabel(row.typeId)}
                            </span>
                            <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
                              Expense {row.id}
                            </span>
                            {row.receipts.length > 0 ? (
                              <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
                                {row.receipts.length} receipt
                                {row.receipts.length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 truncate text-sm text-[var(--foreground)]">
                            {buildRemarkSummary(row.remark)}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-sm font-medium text-[var(--foreground)]">
                            {row.amount.trim()
                              ? formatCurrency(parseAmount(row.amount))
                              : "THB 0.00"}
                          </span>
                          <span className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] text-sm text-[var(--muted)]">
                            {row.isExpanded ? "−" : "+"}
                          </span>
                        </div>
                      </button>

                      {row.isExpanded ? (
                        <div className="mt-4 space-y-4 border-t border-[var(--line)] pt-4">
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                            <label className="block">
                              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                                Type
                              </span>
                              <select
                                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none"
                                value={row.typeId}
                                onChange={(event) =>
                                  updateRow(row.id, "typeId", event.target.value)
                                }
                              >
                                {EXPENSE_TYPES.map((expenseType) => (
                                  <option key={expenseType.id} value={expenseType.id}>
                                    {expenseType.label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block">
                              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                                Amount (THB)
                              </span>
                              <input
                                className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-right text-sm outline-none"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={row.amount}
                                onChange={(event) =>
                                  updateRow(row.id, "amount", event.target.value)
                                }
                              />
                            </label>
                          </div>

                          <label className="block">
                            <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                              Remark
                            </span>
                            <textarea
                              className="min-h-24 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm outline-none"
                              placeholder="Where, why, who, route, or meeting context"
                              value={row.remark}
                              onChange={(event) =>
                                updateRow(row.id, "remark", event.target.value)
                              }
                            />
                          </label>

                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:bg-[var(--surface)]">
                              <span>Attach receipts</span>
                              <input
                                className="hidden"
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(event) => {
                                  void handleReceiptChange(row.id, event.target.files);
                                }}
                              />
                            </label>

                            {row.receipts.length > 0 ? (
                              <button
                                className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--surface)]"
                                type="button"
                                onClick={() => toggleReceiptPreview(row.id)}
                              >
                                {row.isReceiptPreviewOpen ? "Hide" : "Show"} receipts (
                                {row.receipts.length})
                              </button>
                            ) : null}

                            <button
                              className="ml-auto text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
                              type="button"
                              onClick={() => removeRow(row.id)}
                            >
                              Remove
                            </button>
                          </div>

                          {row.receipts.length > 0 && row.isReceiptPreviewOpen ? (
                            <ReceiptPreviewGrid receipts={row.receipts} />
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                    Employee name
                  </span>
                  <input
                    className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm outline-none"
                    type="text"
                    placeholder="Who is submitting this date"
                    value={employeeName}
                    onChange={(event) => setEmployeeName(event.target.value)}
                  />
                </label>

                <label className="mt-4 block">
                  <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                    Note
                  </span>
                  <textarea
                    className="min-h-24 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm outline-none"
                    placeholder="Optional note for approval or accounting"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              </div>

              <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                  Day total
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                  {formatCurrency(totalAmount)}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                  {populatedRows.length} filled expense
                  {populatedRows.length === 1 ? "" : "s"}.
                </p>
                <p className="mt-4 text-xs text-[var(--muted)]">
                  Last print: {lastPrintedAt ?? "Not printed yet"}
                </p>
              </div>
            </section>
          </main>
        </section>

        <section className="print-only print-card rounded-none bg-white p-8">
          <div className="border-b border-black/10 pb-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-black/50">
              NNPC Daily Expense
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-black">
              Expense reimbursement form
            </h2>
          </div>

          <div className="mt-5 grid gap-3 text-sm text-black/70 sm:grid-cols-3">
            <div>
              <span className="block text-black/45">Date</span>
              <span className="font-medium text-black">{formatDisplayDate(expenseDate)}</span>
            </div>
            <div>
              <span className="block text-black/45">Employee</span>
              <span className="font-medium text-black">
                {employeeName || deriveDisplayName(session.userEmail)}
              </span>
            </div>
            <div>
              <span className="block text-black/45">Total</span>
              <span className="font-medium text-black">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          {populatedRows.length === 0 ? (
            <p className="mt-6 text-sm text-black/60">No expenses added.</p>
          ) : (
            <div className="mt-6 overflow-hidden rounded-3xl border border-black/10">
              <div className="grid grid-cols-[0.8fr_1.2fr_2.2fr_1fr] gap-4 bg-black px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] text-white">
                <span>Line</span>
                <span>Type</span>
                <span>Remark</span>
                <span className="text-right">THB</span>
              </div>

              <div className="divide-y divide-black/10">
                {populatedRows.map((row) => (
                  <div
                    className="grid grid-cols-[0.8fr_1.2fr_2.2fr_1fr] gap-4 px-4 py-3 text-sm"
                    key={row.id}
                  >
                    <span>{row.id}</span>
                    <span>{findExpenseTypeLabel(row.typeId)}</span>
                    <span>{row.remark || "-"}</span>
                    <span className="text-right">
                      {row.amount ? formatCurrency(parseAmount(row.amount)) : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 text-sm leading-7 text-black/70">
            <span className="font-medium text-black">Note:</span>{" "}
            {note || "No additional note."}
          </div>
        </section>
      </div>
    </div>
  );
}

function ReceiptPreviewGrid({
  receipts,
}: {
  receipts: ReceiptDraft[];
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {receipts.map((receipt) => (
          <div
            className="flex items-center gap-3 rounded-2xl bg-white p-3"
            key={receipt.id}
          >
            <div
              className="h-14 w-14 shrink-0 rounded-xl bg-cover bg-center"
              style={{
                backgroundImage: `url("${receipt.previewUrl}")`,
              }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--foreground)]">
                {receipt.name}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {receipt.sizeLabel}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
