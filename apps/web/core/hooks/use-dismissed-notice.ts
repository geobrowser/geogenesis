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
  const { isDismissed, remember } = useDismissedNotices();
  return { dismissed: isDismissed(id), remember: useCallback(() => remember([id]), [id, remember]) };
}

/**
 * The same for a notice that stands for several ids at once, such as the Explore banner for every
 * lobby live right now (GEO-3268): dismissing it records each, so the next one still shows.
 */
export function useDismissedNotices() {
  const [dismissedNotices, setDismissedNotices] = useAtom(dismissedNoticesAtom);

  const remember = useCallback(
    (ids: string[]) => {
      setDismissedNotices(previous => {
        const added = ids.filter((id, index) => !previous.includes(id) && ids.indexOf(id) === index);
        return added.length > 0 ? [...previous, ...added] : previous;
      });
    },
    [setDismissedNotices]
  );
  const isDismissed = useCallback((id: string) => dismissedNotices.includes(id), [dismissedNotices]);

  return { isDismissed, remember };
}
