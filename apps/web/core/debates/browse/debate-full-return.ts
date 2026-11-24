'use client';

import * as React from 'react';

import { safeInternalHref } from '~/core/debates/debate-return-navigation';
import { ID } from '~/core/id';
import { isModifiedClick } from '~/core/utils/is-modified-click';
import { readSession, removeSession, writeSession } from '~/core/utils/session-storage';

/**
 * Where the dark full screen's × goes (GEO-3833).
 *
 * The debates app closes its full view back onto the card it grew out of. On the web the full screen
 * is a page, so × goes back in history when the viewer came from a page of this app, and otherwise to
 * a page computed here. `router.back()` alone is wrong twice over: a viewer who arrived from a pasted
 * link would be sent off the site, and one who left an earlier full screen with the browser's Back
 * would carry its record into the next one.
 *
 * So every in-app way into the full screen records where it came from and which debate it opened
 * (`rememberDebateFullReturn`), and × goes back only when that record is for the debate the page was
 * opened on. Anything else pushes the recorded page, or Explore.
 */
const KEY = 'geo:debate-full-return';
/** A record older than this is from another visit, not the way into this page. */
const MAX_AGE_MS = 6 * 60 * 60 * 1_000;
export const DEBATE_FULL_CLOSE_FALLBACK = '/explore';

type Stored = { from: string; to: string; at: number };

/** How many full screens are mounted. A link followed from inside one must not replace the record. */
let fullScreensMounted = 0;

/**
 * Marks the page as a full screen while it is mounted, so links inside it ("Watch another debate" on
 * the end card) leave the record of how the viewer got here alone: overwriting it with this page would
 * make × on the next debate go back to this one rather than out.
 */
export function useDebateFullScreenPresence(present: boolean) {
  React.useEffect(() => {
    if (!present) return;
    fullScreensMounted += 1;
    return () => {
      fullScreensMounted = Math.max(0, fullScreensMounted - 1);
    };
  }, [present]);
}

/**
 * Record the way into a full screen: call it from the click on an in-app link to a debate's page.
 * Skipped from inside a full screen (see {@link useDebateFullScreenPresence}), and for a modified
 * click, which opens a tab whose history has no page to go back to.
 */
export function rememberDebateFullReturn(to: string, from: string = currentHref()) {
  if (fullScreensMounted > 0) return;
  const target = safeInternalHref(to);
  const origin = safeInternalHref(from);
  if (!target || !origin) return;
  const stored: Stored = { from: origin, to: pathOf(target), at: Date.now() };
  writeSession(KEY, JSON.stringify(stored));
}

/**
 * The click handler for an in-app link to a debate's page: records the way in on a plain click. Every
 * such link takes it, so × goes back to wherever the viewer opened the debate from — the Explore card,
 * a claim's Debates list, an activity row, a claim's timecode, the end card's next debate.
 */
export function rememberDebateFullReturnOnClick(to: string) {
  return (event: React.MouseEvent) => {
    if (!isModifiedClick(event)) rememberDebateFullReturn(to);
  };
}

export type DebateFullCloseTarget = { kind: 'back' } | { kind: 'push'; href: string };

/**
 * What × does on the full screen opened on `debateId`, clearing the record either way.
 *
 * Back only when the record says this debate's page was opened from a page of this app, and there is
 * a page behind this one to go back to. A record for some other debate is stale — left by a full
 * screen the viewer left with the browser's Back, or this page was reached from inside another full
 * screen — so its origin is pushed instead, which is where the viewer came into the full screens
 * from. No record at all, a pasted or shared link, goes to Explore.
 */
export function debateFullCloseTarget(
  debateId: string,
  { historyLength = typeof window === 'undefined' ? 0 : window.history.length }: { historyLength?: number } = {}
): DebateFullCloseTarget {
  const stored = readStored();
  removeSession(KEY);
  if (stored && opensDebate(stored.to, debateId) && historyLength > 1) return { kind: 'back' };
  return { kind: 'push', href: stored?.from ?? DEBATE_FULL_CLOSE_FALLBACK };
}

function readStored(): Stored | null {
  const raw = readSession(KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<Stored>;
    if (typeof stored.from !== 'string' || typeof stored.to !== 'string' || typeof stored.at !== 'number') return null;
    if (Date.now() - stored.at > MAX_AGE_MS) return null;
    const from = safeInternalHref(stored.from);
    return from ? { from, to: stored.to, at: stored.at } : null;
  } catch {
    return null;
  }
}

/** A debate's page is `/space/<space>/<debate>`; its last segment names the debate, in either id spelling. */
function opensDebate(path: string, debateId: string) {
  const last = path.split('/').filter(Boolean).at(-1);
  if (!last) return false;
  try {
    return ID.equals(last, debateId);
  } catch {
    return false;
  }
}

function pathOf(href: string) {
  return href.split(/[?#]/, 1)[0];
}

function currentHref() {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
