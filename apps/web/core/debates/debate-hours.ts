/**
 * The daily window when debates actually happen, and the copy that points people at it.
 *
 * Pure and React-free so the arithmetic can be tested against fixed instants and fixed zones —
 * `matchmaking/debate-hours-note` owns the ticking and the "what time is it" part.
 */
import { format } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export type DebateHoursConfig = {
  /**
   * The zone the window is *defined* in. The window is a fixed hour in Pacific, so its local
   * equivalent moves twice a year with US daylight saving — and moves independently again for
   * viewers whose own region changes on different dates. Converting from this zone at render time
   * is what keeps that correct; a stored offset would be wrong for weeks at a stretch.
   */
  timeZone: string;
  /** 24-hour wall-clock times in `timeZone`, `HH:mm`. */
  start: string;
  end: string;
};

const DEFAULT_DEBATE_HOURS: DebateHoursConfig = {
  timeZone: 'America/Los_Angeles',
  start: '09:00',
  end: '10:00',
};

const WALL_CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * `NEXT_PUBLIC_DEBATE_HOURS`, as `start-end` or `start-end@zone` — e.g. `09:00-10:00` or
 * `18:00-19:00@Europe/London`.
 *
 * Anything unparseable falls back to the default rather than throwing: the window is the subject of
 * an empty-state sentence, and a typo in a deploy variable should not take a tab down with it.
 */
export function parseDebateHours(value: string | undefined): DebateHoursConfig {
  if (!value) return DEFAULT_DEBATE_HOURS;

  const [range, zone] = value.trim().split('@');
  const [start, end] = (range ?? '').split('-');
  if (!WALL_CLOCK.test(start ?? '') || !WALL_CLOCK.test(end ?? '')) return DEFAULT_DEBATE_HOURS;

  const timeZone = zone?.trim() || DEFAULT_DEBATE_HOURS.timeZone;
  // A bad zone only fails when it reaches Intl, which is at render time in a tab, so prove it here.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    return DEFAULT_DEBATE_HOURS;
  }

  return { timeZone, start, end };
}

export const DEBATE_HOURS = parseDebateHours(process.env.NEXT_PUBLIC_DEBATE_HOURS);

export type DebateHoursWindow = {
  /** Whether `now` falls inside the window: start inclusive, end exclusive. */
  isOpen: boolean;
  /** The window in progress when open, otherwise the next one to come. */
  start: Date;
  end: Date;
  /**
   * When the answer to `isOpen` changes — the end of the window in progress, or the start of the
   * next one. What the hook schedules its re-render on, so the copy flips without a refresh.
   */
  nextTransition: Date;
};

/** The calendar day `instant` falls on *in `timeZone`*, as `yyyy-MM-dd`. */
function zonedDay(instant: Date, timeZone: string, dayOffset = 0) {
  // `en-CA` is ISO-ordered, so this needs no part reassembly.
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);

  if (dayOffset === 0) return day;
  // Stepped as UTC midnight so the offset is pure calendar arithmetic — this is a date, not an
  // instant, so no zone applies to it and DST cannot make the day come out short.
  const stepped = new Date(`${day}T00:00:00Z`);
  stepped.setUTCDate(stepped.getUTCDate() + dayOffset);
  return stepped.toISOString().slice(0, 10);
}

/** The instant a `HH:mm` wall-clock time on `day` in `timeZone` actually happens at. */
function instantAt(day: string, wallClock: string, timeZone: string) {
  return fromZonedTime(`${day}T${wallClock}:00`, timeZone);
}

function windowOn(day: string, config: DebateHoursConfig) {
  const start = instantAt(day, config.start, config.timeZone);
  let end = instantAt(day, config.end, config.timeZone);
  // An end at or before the start means the window runs past midnight in its own zone, so it closes
  // on the following day. `09:00-10:00` never does; a configured `22:00-01:00` would.
  if (end.getTime() <= start.getTime()) {
    end = instantAt(zonedDay(start, config.timeZone, 1), config.end, config.timeZone);
  }
  return { start, end };
}

/**
 * Where `now` sits relative to the window, and when that changes.
 *
 * Yesterday's window is considered as well as today's: for a viewer far enough east, the window
 * that is open right now started on the previous calendar day back in Pacific.
 */
export function debateHoursWindow(now: Date, config: DebateHoursConfig = DEBATE_HOURS): DebateHoursWindow {
  const candidates = [-1, 0, 1].map(offset => windowOn(zonedDay(now, config.timeZone, offset), config));

  const open = candidates.find(({ start, end }) => now >= start && now < end);
  if (open) return { isOpen: true, start: open.start, end: open.end, nextTransition: open.end };

  // The first window that has not started yet. `candidates` is in ascending order by construction.
  const next = candidates.find(({ start }) => start > now) ?? candidates[candidates.length - 1];
  return { isOpen: false, start: next.start, end: next.end, nextTransition: next.start };
}

/**
 * A local wall-clock time, in the `h:mmaaa` shape the rest of the app formats times in — see
 * `DEFAULT_TIME_FORMAT` and `formatGovernanceOutcomeTime`.
 *
 * Two departures from that constant, both for reading a *range* rather than a timestamp: a whole
 * hour drops its `:00`, and the opening end drops its meridiem when the closing end already carries
 * the same one. `format` runs in the runtime's zone, which is what makes the output the viewer's
 * own local time.
 */
function clockLabel(date: Date, withMeridiem: boolean) {
  const hour = date.getMinutes() === 0 ? 'h' : 'h:mm';
  return format(date, withMeridiem ? `${hour}aaa` : hour);
}

/**
 * The window in the viewer's own local time, e.g. `9-10am`, `11am-12pm`, `2-3am`.
 *
 * The leading meridiem is dropped when both ends share one, which is what makes the common case
 * read as the single span it is rather than as two separate times.
 *
 * Deliberately unqualified by day. The window recurs every 24 hours, so it recurs every day in the
 * viewer's zone too even when it lands overnight — a Tokyo viewer's `1-2am` is as true daily as a
 * London viewer's `5-6pm`, and naming a day would imply the wrong thing about both.
 */
export function formatLocalDebateHours({ start, end }: Pick<DebateHoursWindow, 'start' | 'end'>) {
  const sameMeridiem = start.getHours() < 12 === end.getHours() < 12;
  return `${clockLabel(start, !sameMeridiem)}-${clockLabel(end, true)}`;
}

/**
 * The line added beneath a tab's own empty message.
 *
 * A second sentence rather than a replacement: two of the three tabs already open by saying nobody
 * is around, so the during-hours variant contributes only what they don't say — that the list fills
 * itself in, and that leaving is the one thing that won't help. The lists do live-update, from
 * `debate.matchmaking_changed`, which is what makes "stay here" the honest instruction rather than
 * the ticket's original "check back in a few minutes".
 */
export function debateHoursNote(window: DebateHoursWindow) {
  return window.isOpen
    ? 'Stay here and you’ll be matched as soon as someone joins.'
    : `Debate hours are every day between ${formatLocalDebateHours(window)}. Come back then to join a debate!`;
}
