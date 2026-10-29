'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { todaysClaimsSectionsAtom } from '~/atoms';

/** "Earlier this week", which starts closed where the agenda's own sections start open. */
export const EARLIER_THIS_WEEK_SECTION = 'earlier-this-week';

const NO_CHOICES: Record<string, boolean> = {};

/**
 * GEO-3489. Which Today's claims sections the viewer has opened or closed, held for the day.
 *
 * Kept with the agenda day it was made on, so the next day's agenda opens every section at its
 * default again; a choice made today survives leaving the picker and coming back to it. Stored like
 * the picker's other remembered settings (`rematchHideMyPositionsAtom`).
 */
export function useTodaysSectionsOpen(day: string | null) {
  const [stored, setStored] = useAtom(todaysClaimsSectionsAtom);
  const choices = stored.day === day ? stored.open : NO_CHOICES;

  const isOpen = React.useCallback(
    (sectionKey: string, defaultOpen: boolean) => choices[sectionKey] ?? defaultOpen,
    [choices]
  );

  const setOpen = React.useCallback(
    (sectionKey: string, next: boolean) =>
      setStored(current => ({
        day,
        open: { ...(current.day === day ? current.open : NO_CHOICES), [sectionKey]: next },
      })),
    [day, setStored]
  );

  return { isOpen, setOpen };
}
