'use client';

import { useCallback } from 'react';

import { useAtom } from 'jotai';

import { dismissedNoticesAtom } from '~/atoms';

/**
 * One-time notices: whether this one has been dismissed, and how to record that it has.
 *
 * The read-and-append around `dismissedNoticesAtom` had been written out by hand at every notice on
 * the site, and not identically — `space-notices.tsx` builds the next list from the rendered value
 * (`[...dismissedNotices, id]`) rather than from the setter's argument, so two dismissals in one
 * tick drop each other, and a second click appends the same id twice. The functional form here is
 * the explore banner's, which got it right; sharing it is what stops the next notice picking the
 * other one.
 *
 * `remember` only records. Whether the notice is still on screen after that is the caller's to
 * decide — the email capture keeps its confirmation up after subscribing has already recorded the
 * dismissal, which is not something a combined "dismiss" could express.
 */
export function useDismissedNotice(id: string) {
  const [dismissedNotices, setDismissedNotices] = useAtom(dismissedNoticesAtom);

  const remember = useCallback(() => {
    setDismissedNotices(previous => (previous.includes(id) ? previous : [...previous, id]));
  }, [id, setDismissedNotices]);

  return { dismissed: dismissedNotices.includes(id), remember };
}
