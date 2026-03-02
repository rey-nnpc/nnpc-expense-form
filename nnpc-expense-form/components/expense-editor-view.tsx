"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  FileText,
  ImagePlus,
  LogOut,
  NotebookPen,
  Plus,
  Printer,
  Receipt,
  Trash2,
  UserRound,
} from "lucide-react";
import { ThemeSettingsSheet } from "@/components/theme-settings-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
    () => initialDraft?.employeeName || deriveDisplayName(session.userEmail),
  );
  const [note, setNote] = useState(() => initialDraft?.note ?? "");
  const [rows, setRows] = useState<ExpenseRow[]>(() => hydrateRowsFromDraft(initialDraft));
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
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="screen-only">
          <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
            <CardHeader className="gap-6 border-b border-border/60 px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className="rounded-full border-white/10 bg-white/5 px-4 py-1 text-[0.7rem] uppercase tracking-[0.28em] text-primary"
                      variant="outline"
                    >
                      Expense day
                    </Badge>
                    <Badge className="rounded-full px-3 py-1" variant="secondary">
                      {expenseDate}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
                      Single-day reimbursement sheet
                    </p>
                    <CardTitle className="font-serif text-4xl tracking-[-0.03em] sm:text-5xl">
                      {formatDisplayDate(expenseDate)}
                    </CardTitle>
                    <CardDescription className="max-w-3xl text-sm leading-7 sm:text-base">
                      Keep every row, receipt, and remark tied to this date only. The
                      editor stays compact on mobile and expands into a richer workspace
                      on larger screens.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <ThemeSettingsSheet userEmail={session.userEmail} />
                  <Button
                    className="rounded-full border-white/10 bg-background/70 px-4 shadow-none backdrop-blur-xl hover:bg-background/90"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={handlePrint}
                  >
                    <Printer className="size-4" />
                    Print / PDF
                  </Button>
                  <Button
                    className="rounded-full border-white/10 bg-background/70 px-4 shadow-none backdrop-blur-xl hover:bg-background/90"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void logout();
                    }}
                  >
                    <LogOut className="size-4" />
                    Log out
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="grid gap-3 md:grid-cols-4">
                  <EditorMetric
                    label="Employee"
                    value={employeeName || deriveDisplayName(session.userEmail)}
                    icon={<UserRound className="size-4" />}
                  />
                  <EditorMetric
                    label="Rows"
                    value={`${rows.length}`}
                    icon={<FileText className="size-4" />}
                  />
                  <EditorMetric
                    label="Receipts"
                    value={`${totalReceipts}`}
                    icon={<Receipt className="size-4" />}
                  />
                  <EditorMetric
                    label="Total"
                    value={formatCurrency(totalAmount)}
                    icon={<CalendarDays className="size-4" />}
                  />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    asChild
                    className="rounded-full border-white/10 bg-background/70 px-4 shadow-none backdrop-blur-xl hover:bg-background/90"
                    size="sm"
                    variant="outline"
                  >
                    <Link href="/dashboard">Back to dashboard</Link>
                  </Button>
                  <Button className="rounded-full px-5" size="sm" type="button" onClick={addRow}>
                    <Plus className="size-4" />
                    Create expense
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <main className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,22rem)]">
            <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
              <CardHeader className="gap-4 border-b border-border/60 px-5 py-5 sm:px-6 sm:py-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-2">
                    <Badge className="rounded-full px-3 py-1" variant="secondary">
                      Expense rows
                    </Badge>
                    <CardTitle className="font-serif text-3xl tracking-tight">
                      Daily line items
                    </CardTitle>
                    <CardDescription className="text-sm leading-7 sm:text-base">
                      Expand any row to adjust type, amount, remarks, and receipt images.
                    </CardDescription>
                  </div>

                  <Button className="rounded-full px-5" type="button" onClick={addRow}>
                    <Plus className="size-4" />
                    Add row
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
                {rows.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-background/60 px-5 py-12 text-center text-sm text-muted-foreground">
                    No expenses yet. Create the first row to begin the day sheet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rows.map((row) => (
                      <article
                        className="rounded-3xl border border-white/10 bg-background/65 p-4 sm:p-5"
                        key={row.id}
                      >
                        <button
                          className="flex w-full flex-col gap-4 text-left sm:flex-row sm:items-start sm:justify-between"
                          type="button"
                          onClick={() => toggleExpanded(row.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="rounded-full px-3 py-1">
                                {findExpenseTypeLabel(row.typeId)}
                              </Badge>
                              <Badge className="rounded-full px-3 py-1" variant="outline">
                                Expense {row.id}
                              </Badge>
                              {row.receipts.length > 0 ? (
                                <Badge className="rounded-full px-3 py-1" variant="outline">
                                  {row.receipts.length} receipt
                                  {row.receipts.length === 1 ? "" : "s"}
                                </Badge>
                              ) : null}
                            </div>

                            <p className="mt-4 text-sm leading-7 text-foreground sm:text-base">
                              {buildRemarkSummary(row.remark)}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-3 sm:justify-end">
                            <span className="text-base font-semibold text-foreground">
                              {row.amount.trim()
                                ? formatCurrency(parseAmount(row.amount))
                                : "THB 0.00"}
                            </span>
                            <span className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-background/80 text-muted-foreground">
                              {row.isExpanded ? (
                                <ChevronUp className="size-4" />
                              ) : (
                                <ChevronDown className="size-4" />
                              )}
                            </span>
                          </div>
                        </button>

                        {row.isExpanded ? (
                          <div className="mt-5 space-y-5 border-t border-border/60 pt-5">
                            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_11rem]">
                              <label className="block space-y-2">
                                <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                  Type
                                </span>
                                <Select
                                  value={row.typeId}
                                  onValueChange={(value) =>
                                    updateRow(row.id, "typeId", value)
                                  }
                                >
                                  <SelectTrigger className="h-11 w-full rounded-2xl border-white/10 bg-background/75 px-4">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-2xl border-white/10 bg-popover/95 backdrop-blur-xl">
                                    {EXPENSE_TYPES.map((expenseType) => (
                                      <SelectItem key={expenseType.id} value={expenseType.id}>
                                        {expenseType.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </label>

                              <label className="block space-y-2">
                                <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                  Amount (THB)
                                </span>
                                <Input
                                  className="h-11 rounded-2xl border-white/10 bg-background/75 px-4 text-right"
                                  min="0"
                                  placeholder="0.00"
                                  step="0.01"
                                  type="number"
                                  value={row.amount}
                                  onChange={(event) =>
                                    updateRow(row.id, "amount", event.target.value)
                                  }
                                />
                              </label>
                            </div>

                            <label className="block space-y-2">
                              <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                Remark
                              </span>
                              <Textarea
                                className="min-h-28 rounded-2xl border-white/10 bg-background/75 px-4 py-3"
                                placeholder="Where, why, who, route, or meeting context"
                                value={row.remark}
                                onChange={(event) =>
                                  updateRow(row.id, "remark", event.target.value)
                                }
                              />
                            </label>

                            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                              <Button
                                asChild
                                className="rounded-full border-white/10 bg-background/70 px-4 shadow-none hover:bg-background/85"
                                size="sm"
                                variant="outline"
                              >
                                <label className="cursor-pointer">
                                  <ImagePlus className="size-4" />
                                  Attach receipts
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
                              </Button>

                              {row.receipts.length > 0 ? (
                                <Button
                                  className="rounded-full px-4"
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() => toggleReceiptPreview(row.id)}
                                >
                                  {row.isReceiptPreviewOpen ? "Hide" : "Show"} receipts (
                                  {row.receipts.length})
                                </Button>
                              ) : null}

                              <Button
                                className="rounded-full px-4 text-destructive hover:text-destructive"
                                size="sm"
                                type="button"
                                variant="ghost"
                                onClick={() => removeRow(row.id)}
                              >
                                <Trash2 className="size-4" />
                                Remove
                              </Button>
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
              </CardContent>
            </Card>

            <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
              <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
                <CardHeader className="gap-3 border-b border-border/60 px-5 py-5">
                  <Badge className="rounded-full px-3 py-1" variant="secondary">
                    Day profile
                  </Badge>
                  <CardTitle className="font-serif text-3xl tracking-tight">
                    Approver details
                  </CardTitle>
                  <CardDescription className="text-sm leading-7">
                    These fields print with the expense sheet and are saved with the draft.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5 px-5 py-5">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">Employee name</span>
                    <Input
                      className="h-11 rounded-2xl border-white/10 bg-background/75 px-4"
                      placeholder="Who is submitting this date"
                      type="text"
                      value={employeeName}
                      onChange={(event) => setEmployeeName(event.target.value)}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-foreground">Note</span>
                    <Textarea
                      className="min-h-28 rounded-2xl border-white/10 bg-background/75 px-4 py-3"
                      placeholder="Optional note for approval or accounting"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                </CardContent>
              </Card>

              <Card className="premium-panel rounded-[2rem] border-border/60 py-0">
                <CardHeader className="gap-3 border-b border-border/60 px-5 py-5">
                  <Badge className="rounded-full px-3 py-1" variant="secondary">
                    Summary
                  </Badge>
                  <CardTitle className="font-serif text-3xl tracking-tight">
                    {formatCurrency(totalAmount)}
                  </CardTitle>
                  <CardDescription className="text-sm leading-7">
                    {populatedRows.length} filled expense
                    {populatedRows.length === 1 ? "" : "s"} with {totalReceipts} receipt
                    {totalReceipts === 1 ? "" : "s"} attached.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 px-5 py-5">
                  <div className="rounded-3xl border border-white/10 bg-background/65 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                      Last print
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {lastPrintedAt ?? "Not printed yet"}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-background/65 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                      Quick check
                    </p>
                    <p className="mt-2 text-sm leading-7 text-foreground">
                      Add a concise remark for each filled row so the printed copy stays
                      review-friendly for finance and approvers.
                    </p>
                  </div>

                  <Button className="h-11 w-full rounded-2xl" type="button" onClick={handlePrint}>
                    <Printer className="size-4" />
                    Print this day sheet
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-border/60 py-0">
                <CardContent className="px-5 py-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                      <NotebookPen className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">Auto-saved draft</p>
                      <p className="text-sm text-muted-foreground">{session.userEmail}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
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

function EditorMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-background/65 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <p className="mt-3 truncate text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ReceiptPreviewGrid({
  receipts,
}: {
  receipts: ReceiptDraft[];
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-background/60 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {receipts.map((receipt) => (
          <div
            className="flex items-center gap-3 rounded-3xl border border-white/10 bg-background/80 p-3"
            key={receipt.id}
          >
            <div
              className="h-16 w-16 shrink-0 rounded-2xl bg-cover bg-center"
              style={{
                backgroundImage: `url("${receipt.previewUrl}")`,
              }}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{receipt.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{receipt.sizeLabel}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
