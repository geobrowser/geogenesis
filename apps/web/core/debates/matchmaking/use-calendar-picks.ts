'use client';

import * as React from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { type CalendarPicks, calendarPicksKey } from './calendar-narrowing';
import { CALENDAR_PATH, readCalendarPicks, writeCalendarPicks } from './debate-calendar-route';

/**
 * The calendar panel's picks (GEO-3220): held here, mirrored to the URL so a narrowed week survives a
 * reload and can be shared.
 *
 * Not read straight from the URL, which was the first version. `router.replace` lands in
 * `useSearchParams` a beat later, so two quick ticks both built on the same stale picks and the
 * second write dropped the first (Copilot on #2770). Held in state, each tick builds on the last: a
 * discrete event's update is rendered before the next event runs.
 *
 * The URL still leads when it changes from outside — Back, Forward, a link to a narrowed week — so
 * every change it reports is checked against the writes this hook has made and not yet seen land.
 * One of those landing is an echo and changes nothing; anything else is adopted.
 */
export function useCalendarPicks(): [CalendarPicks, (next: CalendarPicks) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlPicks = React.useMemo(() => readCalendarPicks(searchParams), [searchParams]);
  const urlKey = calendarPicksKey(urlPicks);
  const [picks, setPicksState] = React.useState(urlPicks);
  // Keys of this hook's writes, oldest first, until the URL reports each.
  const inFlight = React.useRef<string[]>([]);

  React.useEffect(() => {
    const echo = inFlight.current.indexOf(urlKey);
    if (echo >= 0) {
      // Ours, and so is everything written before it, whether or not the router reported each.
      inFlight.current.splice(0, echo + 1);
      return;
    }
    inFlight.current = [];
    setPicksState(current => (calendarPicksKey(current) === urlKey ? current : urlPicks));
  }, [urlKey, urlPicks]);

  const setPicks = React.useCallback(
    (next: CalendarPicks) => {
      setPicksState(next);
      const key = calendarPicksKey(next);
      // A write the URL already says would never be reported, so it is not waited on.
      if (key !== urlKey) inFlight.current.push(key);
      const params = writeCalendarPicks(new URLSearchParams(searchParams?.toString()), next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : (pathname ?? CALENDAR_PATH), { scroll: false });
    },
    [pathname, router, searchParams, urlKey]
  );

  return [picks, setPicks];
}
