'use client';

import * as React from 'react';

/**
 * `Date.now()`, re-read on each minute boundary and when the tab comes back into view. Pass the
 * result into time labels so they re-render as the clock moves.
 */
export function useMinuteNow() {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      timer = setTimeout(tick, 60_000 - (current % 60_000));
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    // Background tabs throttle timers, so the clock is read again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return now;
}
