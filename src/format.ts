import type { LineTotals } from "./numstat.ts";

export function formatCounts(added: number, removed: number): string {
  return `+${added} −${removed}`;
}

export function formatTotals(totals: LineTotals): string {
  if (totals.files === 0) {
    return "no changes";
  }
  const files = totals.files === 1 ? "1 file" : `${totals.files} files`;
  return `${formatCounts(totals.added, totals.removed)} · ${files}`;
}

export function addedPercent(added: number, removed: number): number | null {
  const total = added + removed;
  return total === 0 ? null : (added / total) * 100;
}
