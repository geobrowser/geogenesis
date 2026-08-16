'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import { type DebatesHubTab, debatesHubAtom } from '~/atoms';

const DEFAULT_TAB: DebatesHubTab = 'requests';

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
