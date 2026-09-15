import { ID } from '~/core/id';
import type { Value } from '~/core/types';
import { localToUtcMs, parseSchedule } from '~/core/utils/schedule';

import { EVENT_SCHEMA } from './constants';

/**
 * `Meeting Time` — the iCal schedule a `Community call event` carries in practice.
 *
 * Not in `EVENT_SCHEMA` because nothing in this app writes it: `buildPublishRecordingsOps` writes
 * `Start time` / `End time`. This is what curator-backend's own publisher writes, and on testnet it
 * is the overwhelming majority — 100 of 107 events carry `Meeting Time` and only 6 carry
 * `Start time`. A reader that knows only the schema this app writes finds no date on ~94% of them.
 */
export const MEETING_TIME_PROPERTY = '3ae3d1efebfc433da4bdebaa823348c9';

export type EventTiming = {
  startMs: number;
  /** Absent when the source gave a start but no end — `Occurence original start`, or a bare DTSTART. */
  endMs: number | null;
};

export type EventPhase = 'upcoming' | 'live' | 'past' | 'undated';

function readValue(values: Value[], propertyId: string): string | null {
  const match = values.find(value => value.isDeleted !== true && ID.equals(value.property.id, propertyId));
  return match?.value ?? null;
}

function parseInstant(raw: string | null): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * DTSTART/DTEND out of an iCal schedule, through the parser the call forms already use so the two
 * agree about TZID handling and about which digits are wall-clock rather than UTC.
 *
 * An event's schedule describes that one occurrence, so an RRULE on it — if a publisher ever
 * writes one — is ignored rather than expanded: DTSTART is this event's slot either way.
 */
function parseScheduleTiming(raw: string | null): EventTiming | null {
  if (!raw) return null;

  const parsed = parseSchedule(raw);
  if (!parsed.startDate || !parsed.startTime) return null;

  const toMs = (time: string): number | null => {
    const naive = Date.parse(`${parsed.startDate}T${time}:00Z`);
    if (Number.isNaN(naive)) return null;
    return parsed.timezone ? localToUtcMs(naive, parsed.timezone) : naive;
  };

  const startMs = toMs(parsed.startTime);
  if (startMs === null) return null;

  const endMs = parsed.endTime ? toMs(parsed.endTime) : null;
  // An end before its start means DTEND crossed midnight, which the date-plus-time reconstruction
  // above cannot see. A day later is the only reading that keeps the event a single sitting.
  return { startMs, endMs: endMs !== null && endMs < startMs ? endMs + 24 * 60 * 60 * 1000 : endMs };
}

/**
 * When a `Community call event` happened, from whichever of the three shapes it was published in.
 *
 * Ordered by how specific the source is rather than by how common it is. `Start time` / `End time`
 * are this app's own writes and describe the sitting exactly, including a call that ran long;
 * `Meeting Time` is the slot it was scheduled for; `Occurence original start` is only the RRULE
 * rung it came from, and carries no end at all.
 */
export function resolveEventTiming(values: Value[]): EventTiming | null {
  const startTime = parseInstant(readValue(values, EVENT_SCHEMA.START_TIME_PROPERTY));
  if (startTime !== null) {
    return { startMs: startTime, endMs: parseInstant(readValue(values, EVENT_SCHEMA.END_TIME_PROPERTY)) };
  }

  const scheduled = parseScheduleTiming(readValue(values, MEETING_TIME_PROPERTY));
  if (scheduled) return scheduled;

  const original = parseInstant(readValue(values, EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY));
  return original === null ? null : { startMs: original, endMs: null };
}

/**
 * How long a call with no published end is assumed to run, for the purpose of deciding whether it
 * is on right now. Only `Occurence original start` lands here.
 */
const ASSUMED_DURATION_MS = 60 * 60 * 1000;

export function eventPhase(timing: EventTiming | null, nowMs: number): EventPhase {
  if (!timing) return 'undated';
  if (nowMs < timing.startMs) return 'upcoming';
  return nowMs <= (timing.endMs ?? timing.startMs + ASSUMED_DURATION_MS) ? 'live' : 'past';
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How far off a call is, in the largest unit that still says something useful — "in 3 days" rather
 * than "in 74 hours". Deliberately coarse: this sits beside the exact date and time, so its job is
 * to make "soon" or "a while away" readable at a glance, not to be a clock.
 *
 * Distinct from `formatRelativeTime`, which counts time that has already passed for chat stamps.
 */
export function formatTimeUntil(startMs: number, nowMs: number): string {
  const delta = startMs - nowMs;
  if (delta <= 0) return 'now';
  if (delta < MINUTE_MS) return 'in under a minute';
  if (delta < HOUR_MS) {
    const minutes = Math.round(delta / MINUTE_MS);
    return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  if (delta < DAY_MS) {
    const hours = Math.round(delta / HOUR_MS);
    return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.round(delta / DAY_MS);
  if (days < 7) return `in ${days} day${days === 1 ? '' : 's'}`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `in ${weeks} week${weeks === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  return `in ${months} month${months === 1 ? '' : 's'}`;
}
