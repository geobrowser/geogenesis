'use client';

import * as React from 'react';

import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';

const pendingTabAtom = atom<{ href: string; row: string } | null>(null);

const tabContentSkeletonAtom = atom(false);

/**
 * The pending tab of a tab row, shared with {@link TabContentPending}.
 *
 * Last click wins, and a tab only releases the slot if it is the one holding it. Tabs report in tree
 * order, so when the pending tab moves backwards along the row the tab being released reports after
 * the one being claimed, and an unconditional clear would undo the new claim. Covered by a test in
 * both rows.
 */
export function usePendingTab(fullPath: string) {
  const row = React.useId();
  const [pendingTab, setPendingTab] = useAtom(pendingTabAtom);

  const handlePendingChange = React.useCallback(
    (href: string, pending: boolean) => {
      setPendingTab(current => (pending ? { href, row } : current?.href === href ? null : current));
    },
    [row, setPendingTab]
  );

  // A tab switched in place has no link status to clear its mark, so the URL arriving does.
  React.useEffect(() => {
    setPendingTab(current => (current?.href === fullPath ? null : current));
  }, [fullPath, setPendingTab]);

  React.useEffect(() => () => setPendingTab(current => (current?.row === row ? null : current)), [row, setPendingTab]);

  return { pendingHref: pendingTab?.row === row ? pendingTab.href : null, handlePendingChange };
}

export function useTabContentSkeleton() {
  return useAtomValue(tabContentSkeletonAtom);
}

/** Shows `fallback` instead of the tab content while a tab is pending. */
export function TabContentPending({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) {
  const loading = useAtomValue(pendingTabAtom) !== null;
  const setHasSkeleton = useSetAtom(tabContentSkeletonAtom);

  React.useEffect(() => {
    setHasSkeleton(true);
    return () => setHasSkeleton(false);
  }, [setHasSkeleton]);

  return (
    <>
      {loading && fallback}
      <div className={loading ? 'hidden' : 'contents'}>{children}</div>
    </>
  );
}
