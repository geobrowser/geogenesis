'use client';

import * as React from 'react';

export const TODAYS_CLAIMS_SECTIONS_STORAGE_KEY = 'geo:todays-claims-sections';

/** "Earlier this week", which starts closed where the agenda's own sections start open. */
export const EARLIER_THIS_WEEK_SECTION = 'earlier-this-week';

type StoredSections = { day: string; open: Record<string, boolean> };

function readStored(day: string): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(TODAYS_CLAIMS_SECTIONS_STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<StoredSections>) : null;
    return stored?.day === day && stored.open && typeof stored.open === 'object' ? stored.open : {};
  } catch {
    return {};
  }
}

function writeStored(day: string, open: Record<string, boolean>) {
  try {
    window.localStorage.setItem(TODAYS_CLAIMS_SECTIONS_STORAGE_KEY, JSON.stringify({ day, open }));
  } catch {
    // Storage off or full: the choice holds for this visit and is forgotten after.
  }
}

/**
 * GEO-3489. Which Today's claims sections the viewer has opened or closed, held for the day.
 *
 * Kept with the agenda day it was made on, so the next day's agenda opens every section at its
 * default again; a choice made today survives leaving the picker and coming back to it. Per browser,
 * like the rest of the picker's remembered settings.
 */
export function useTodaysSectionsOpen(day: string | null) {
  const [open, setOpenState] = React.useState<{ day: string | null; open: Record<string, boolean> }>(() => ({
    day,
    open: day ? readStored(day) : {},
  }));
  // A day that arrives after mount, or a new day's agenda, reads what that day has stored.
  const current = React.useMemo(() => (open.day === day ? open.open : day ? readStored(day) : {}), [day, open]);

  const isOpen = React.useCallback(
    (sectionKey: string, defaultOpen: boolean) => current[sectionKey] ?? defaultOpen,
    [current]
  );

  const setOpen = React.useCallback(
    (sectionKey: string, next: boolean) => {
      const updated = { ...current, [sectionKey]: next };
      setOpenState({ day, open: updated });
      if (day) writeStored(day, updated);
    },
    [current, day]
  );

  return { isOpen, setOpen };
}
