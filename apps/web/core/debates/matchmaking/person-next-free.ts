import { formatSlot } from './shared-times';

/**
 * "Free today 6 PM", "Free tomorrow 9:30 AM", "Free Fri 5:30 PM": the one fact a People row shows for
 * someone who can't be asked right now (GEO-3463), from the first of the times the row already holds.
 *
 * Built on `formatSlot` so the day naming matches the chips and the booking week exactly, then
 * trimmed to the build spec's clock ("6 PM", not "6:00 PM") and lowercased after "Free", where
 * "Today" would read as a heading. `null` when there is no upcoming time to name.
 */
export function nextFreeLabel(
  schedule: { slots: { start: string }[] } | null | undefined,
  now: Date = new Date(),
  timezone?: string
): string | null {
  const first = schedule?.slots[0];
  if (!first) return null;
  const when = formatSlot(first.start, now, timezone).replace(/:00(?!\d)/, '');
  return `Free ${when.replace(/^(Today|Tomorrow)\b/, day => day.toLowerCase())}`;
}
