'use client';

import * as React from 'react';

import { DIALOG_ACTION_BUTTON_CLASS_NAME, DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME } from '~/design-system/button';

import { RankingFlowDialog } from './ranking-flow-dialog';

/**
 * Warns before leaving the ranking screen with unpublished changes (Preston, 12 Nov).
 *
 * The App Router has no way to block a navigation, so each way out is caught where it starts:
 * - the screen's own back arrow, through `guard(leave)`;
 * - in-app links, by a capture-phase click listener on same-origin anchors;
 * - the browser's Back, by a history entry pushed while there are changes, whose `popstate` opens
 *   the prompt instead of leaving;
 * - closing or reloading the tab, by `beforeunload`, which can only show the browser's own prompt.
 *
 * Nothing is armed while there is nothing unpublished, so right after a publish nothing fires.
 */
export function useUnpublishedLeaveGuard({
  active,
  count,
  isPublishing,
  onPublish,
}: {
  /** There are unpublished changes. */
  active: boolean;
  count: number;
  isPublishing: boolean;
  /** Publishes the whole ballot; resolves true when it went out. */
  onPublish: () => Promise<boolean>;
}) {
  const [pending, setPending] = React.useState<(() => void) | null>(null);
  const activeRef = React.useRef(active);
  activeRef.current = active;

  /** Runs `leave` now, or once the person has chosen in the prompt. */
  const guard = React.useCallback((leave: () => void) => {
    if (!activeRef.current) {
      leave();
      return;
    }
    setPending(() => leave);
  }, []);

  // Tab close and reload.
  React.useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);

  // In-app links.
  React.useEffect(() => {
    if (!active) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(() => () => window.location.assign(url.toString()));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active]);

  // The browser's Back: a spare history entry while there are changes, spent by Back.
  const sentinelRef = React.useRef(false);
  React.useEffect(() => {
    if (!active) return;
    if (!sentinelRef.current) {
      window.history.pushState({ rankingLeaveGuard: true }, '', window.location.href);
      sentinelRef.current = true;
    }
    const onPopState = () => {
      if (!activeRef.current) return;
      sentinelRef.current = false;
      setPending(() => () => window.history.back());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [active]);

  const close = (keepRanking: boolean) => {
    setPending(null);
    // Back spent the spare entry; staying needs it again so the next Back is caught too.
    if (keepRanking && activeRef.current && !sentinelRef.current) {
      window.history.pushState({ rankingLeaveGuard: true }, '', window.location.href);
      sentinelRef.current = true;
    }
  };

  const leaveNow = (leave: () => void) => {
    activeRef.current = false;
    setPending(null);
    // A spare entry still in place would make Back land on this screen again: spend it first (it is
    // this same URL, so nothing navigates), then leave once the browser says it's gone.
    if (sentinelRef.current) {
      sentinelRef.current = false;
      window.addEventListener('popstate', () => leave(), { once: true });
      window.history.back();
      return;
    }
    leave();
  };

  const dialog = pending ? (
    <RankingFlowDialog
      open
      phoneSheet
      onClose={() => close(true)}
      title="Publish your ranking?"
      subtitle={
        count === 1
          ? 'You have 1 change that isn’t published yet. If you leave without publishing, it’s lost.'
          : `You have ${count} changes that aren’t published yet. If you leave without publishing, they’re lost.`
      }
      footer={
        <>
          <button
            type="button"
            className={`${DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME} !w-auto md:!w-full`}
            onClick={() => close(true)}
          >
            Keep ranking
          </button>
          <button
            type="button"
            className={`${DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME} !w-auto md:!w-full`}
            onClick={() => leaveNow(pending)}
          >
            Leave without publishing
          </button>
          <button
            type="button"
            className={`${DIALOG_ACTION_BUTTON_CLASS_NAME} !w-auto md:!w-full`}
            disabled={isPublishing}
            onClick={async () => {
              const leave = pending;
              if (await onPublish()) leaveNow(leave);
            }}
          >
            {isPublishing ? 'Publishing…' : 'Publish and leave'}
          </button>
        </>
      }
    >
      {null}
    </RankingFlowDialog>
  ) : null;

  return { guard, dialog };
}
