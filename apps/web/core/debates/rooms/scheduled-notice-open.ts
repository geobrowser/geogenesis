'use client';

import * as React from 'react';

/**
 * Whether a scheduling dialog is up anywhere on the page (GEO-3428), so the nudge popup never stacks
 * on one: a Running late / Can't make it dialog (an email's link, the availability link's board 2),
 * or a week being booked or moved.
 *
 * A registry rather than a flag, like `app-bottom-inset`: two dialogs can be up at once, and one
 * closing must not clear the other.
 */
const open = new Set<symbol>();
const subscribers = new Set<() => void>();

function notify() {
  for (const subscriber of subscribers) subscriber();
}

function subscribe(subscriber: () => void) {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

/** Counts this dialog as open while `active`. */
export function useHoldScheduledNotice(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const id = Symbol('scheduled-notice');
    open.add(id);
    notify();
    return () => {
      open.delete(id);
      notify();
    };
  }, [active]);
}

/** Whether any scheduling notice dialog is open. */
export function useScheduledNoticeOpen(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => open.size > 0,
    () => false
  );
}
