'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { type DebatesHubTab, debatesHubAtom } from '~/atoms';

/**
 * Opening the panel lands on People (GEO-3463). It is the tab people use most, and it can always
 * answer — someone is online or has times this week — where Matches is often empty. Deliberately not
 * the megaphone's badge target: a pending request still needs one click to Requests, which is the
 * trade for not opening onto an empty list the rest of the time.
 */
const DEFAULT_TAB: DebatesHubTab = 'people';

export function useDebatesHub() {
  const [state, setState] = useAtom(debatesHubAtom);

  // `requestId` only when there is one, so every other open stores `{ tab }` exactly as before.
  const open = React.useCallback(
    (tab: DebatesHubTab = DEFAULT_TAB, requestId?: string) => setState(requestId ? { tab, requestId } : { tab }),
    [setState]
  );
  const close = React.useCallback(() => setState(null), [setState]);
  const toggle = React.useCallback(
    (tab: DebatesHubTab = DEFAULT_TAB) => setState(current => (current ? null : { tab })),
    [setState]
  );
  const setTab = React.useCallback((tab: DebatesHubTab) => setState({ tab }), [setState]);

  return {
    isOpen: state !== null,
    activeTab: state?.tab ?? DEFAULT_TAB,
    /** The scheduled request a link asked to see (GEO-3431), or null. */
    focusedRequestId: state?.requestId ?? null,
    open,
    close,
    toggle,
    setTab,
  };
}
