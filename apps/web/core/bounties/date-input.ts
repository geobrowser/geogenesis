/** `YYYY-MM-DD` for a date input from an ISO datetime, or ''. */
export function dateInputValue(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

/** End of the chosen day, UTC, as ISO — deadlines are dates in inputs but datetimes on-chain. */
export function deadlineFromDateInput(value: string): string | null {
  if (!value) return null;
  const ms = Date.parse(`${value}T23:59:59.000Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
