import type { ChatViewMessage } from './types';

export const DAY_DIVIDER_COPY = {
  today: 'Today',
  yesterday: 'Yesterday',
} as const;

/** The viewer's local calendar day, as a comparable key. */
function localDayKey(date: Date) {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** "Today", "Yesterday", "Wednesday 14 Oct", with the year when it is not the current one. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = localDayKey(date);
  if (day === localDayKey(now)) return DAY_DIVIDER_COPY.today;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day === localDayKey(yesterday)) return DAY_DIVIDER_COPY.yesterday;
  const sameYear = date.getFullYear() === now.getFullYear();
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)?.value;
  return [part('weekday'), part('day'), part('month'), sameYear ? undefined : part('year')].filter(Boolean).join(' ');
}

/**
 * The messages (by index) that start a new local day, with that day's label. The first loaded
 * message always starts one. Pending sends never do.
 */
export function dayBreaks(messages: ChatViewMessage[], now: Date = new Date()): Map<number, string> {
  const breaks = new Map<number, string>();
  let previousDay: number | null = null;
  messages.forEach((message, index) => {
    if (message.pending) return;
    const date = new Date(message.createdAt);
    if (Number.isNaN(date.getTime())) return;
    const day = localDayKey(date);
    if (day !== previousDay) breaks.set(index, dayLabel(message.createdAt, now));
    previousDay = day;
  });
  return breaks;
}
