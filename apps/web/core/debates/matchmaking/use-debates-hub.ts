'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { type DebatesHubTab, debatesHubAtom } from '~/atoms';

/**
 * Opening the panel lands on Claims — the list you can always act on, and the reason to open the
 * hub when nothing is pending. Deliberately not the megaphone's badge target: a pending request
 * still needs one click to Requests, which is the trade for not opening onto an empty list the
 * rest of the time.
 */
const DEFAULT_TAB: DebatesHubTab = 'claims';

export function useDebatesHub() {
  const [state, setState] = useAtom(debatesHubAtom);

  const open = React.useCallback((tab: DebatesHubTab = DEFAULT_TAB) => setState({ tab }), [setState]);
  const close = React.useCallback(() => setState(null), [setState]);
  const toggle = React.useCallback(
    (tab: DebatesHubTab = DEFAULT_TAB) => setState(current => (current ? null : { tab })),
    [setState]
  );
  const setTab = React.useCallback((tab: DebatesHubTab) => setState({ tab }), [setState]);

  return {
    isOpen: state !== null,
    activeTab: state?.tab ?? DEFAULT_TAB,
    open,
    close,
    toggle,
    setTab,
  };
}
