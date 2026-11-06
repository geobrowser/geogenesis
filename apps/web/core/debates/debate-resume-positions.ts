import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

/**
 * Where the viewer stopped in each debate, so opening it again resumes there.
 *
 * Stored per browser in localStorage. Positions are playhead seconds, which work for both recordings.
 * Without storage, every debate starts at the beginning.
 */
export const RESUME_STORAGE_KEY = 'geo.debates.resume.v1';

export const RESUME_RETENTION_DAYS = 14;

export const MAX_RESUME_POSITIONS = 500;

export const RESUME_MIN_SECONDS = 15;

export const RESUME_END_MARGIN_SECONDS = 10;

export const RESUME_REWIND_SECONDS = 5;

export const RESUME_SAVE_EVERY_SECONDS = 5;

const DAY_SEC = 86_400;

type StoredEntry = { p: number; at: number };
type Stored = { v: 1; e: Record<string, StoredEntry> };

const nowSec = () => Math.floor(Date.now() / 1000);

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function decode(raw: string | null): Map<string, StoredEntry> {
  const entries = new Map<string, StoredEntry>();
  if (!raw) return entries;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return entries;
  }
  const record = (parsed as Partial<Stored> | null)?.e;
  if (!record || typeof record !== 'object') return entries;
  for (const [id, value] of Object.entries(record)) {
    if (!value || !Number.isFinite(value.p) || !Number.isFinite(value.at) || value.p < 0) continue;
    entries.set(id, { p: value.p, at: value.at });
  }
  return entries;
}

/** Drops expired positions and keeps the most recent ones. */
export function pruneResumePositions(entries: ReadonlyMap<string, StoredEntry>, now: number): Map<string, StoredEntry> {
  const cutoff = now - RESUME_RETENTION_DAYS * DAY_SEC;
  const kept = [...entries].filter(([, entry]) => entry.at >= cutoff);
  if (kept.length > MAX_RESUME_POSITIONS) {
    kept.sort((a, b) => b[1].at - a[1].at);
    kept.length = MAX_RESUME_POSITIONS;
  }
  return new Map(kept);
}

/** Re-reads before writing, so positions saved by other tabs are kept. */
function update(change: (entries: Map<string, StoredEntry>) => void) {
  const store = storage();
  if (!store) return;
  try {
    const entries = decode(store.getItem(RESUME_STORAGE_KEY));
    change(entries);
    const e = Object.fromEntries(pruneResumePositions(entries, nowSec()));
    store.setItem(RESUME_STORAGE_KEY, JSON.stringify({ v: 1, e } satisfies Stored));
  } catch {}
}

/** Where to resume this debate, a few seconds before the viewer stopped, or null to start at the beginning. */
export function readDebateResumeSeconds(debateId: string): number | null {
  const store = storage();
  if (!store) return null;
  let entry: StoredEntry | undefined;
  try {
    entry = pruneResumePositions(decode(store.getItem(RESUME_STORAGE_KEY)), nowSec()).get(normId(debateId));
  } catch {
    return null;
  }
  if (!entry || entry.p < RESUME_MIN_SECONDS) return null;
  // Stay at or above the minimum, or the first save would forget the position.
  return Math.max(RESUME_MIN_SECONDS, entry.p - RESUME_REWIND_SECONDS);
}

/** Saves the position. Near the start or the end, forgets it instead. */
export function rememberDebatePosition(debateId: string, seconds: number, timelineSeconds: number): void {
  if (!Number.isFinite(seconds)) return;
  const finished = timelineSeconds > 0 && seconds >= timelineSeconds - RESUME_END_MARGIN_SECONDS;
  if (seconds < RESUME_MIN_SECONDS || finished) {
    forgetDebatePosition(debateId);
    return;
  }
  const id = normId(debateId);
  update(entries => entries.set(id, { p: Math.floor(seconds), at: nowSec() }));
}

/** The next visit starts at the beginning. */
export function forgetDebatePosition(debateId: string): void {
  const id = normId(debateId);
  const store = storage();
  if (!store) return;
  try {
    if (!decode(store.getItem(RESUME_STORAGE_KEY)).has(id)) return;
  } catch {
    return;
  }
  update(entries => entries.delete(id));
}

/**
 * Saves the position every few seconds while playing, and again when playback stops or the page closes.
 *
 * The last save uses what the effect saw, because a reused card may already hold the next debate.
 */
export function useRememberDebatePosition({
  debateId,
  playheadSeconds,
  timelineSeconds,
  recording,
}: {
  debateId: string;
  playheadSeconds: number;
  timelineSeconds: number;
  recording: boolean;
}) {
  const seenRef = React.useRef<{ debateId: string; seconds: number; timelineSeconds: number } | null>(null);
  const writtenRef = React.useRef<{ debateId: string; seconds: number } | null>(null);

  const write = React.useCallback(() => {
    const seen = seenRef.current;
    if (!seen) return;
    const written = writtenRef.current;
    if (written?.debateId === seen.debateId && written.seconds === seen.seconds) return;
    writtenRef.current = { debateId: seen.debateId, seconds: seen.seconds };
    rememberDebatePosition(seen.debateId, seen.seconds, seen.timelineSeconds);
  }, []);

  React.useEffect(() => {
    if (!recording) return;
    seenRef.current = { debateId, seconds: playheadSeconds, timelineSeconds };
    const written = writtenRef.current;
    if (written?.debateId === debateId && Math.abs(playheadSeconds - written.seconds) < RESUME_SAVE_EVERY_SECONDS) {
      return;
    }
    write();
  }, [debateId, playheadSeconds, recording, timelineSeconds, write]);

  React.useEffect(() => {
    if (!recording) return;
    window.addEventListener('pagehide', write);
    return () => {
      window.removeEventListener('pagehide', write);
      write();
    };
  }, [debateId, recording, write]);
}
