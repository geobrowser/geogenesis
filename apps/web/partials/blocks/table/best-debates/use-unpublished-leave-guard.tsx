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
 * Nothing is armed while there is nothing unpublished, so right after a publish nothing fires. The
 * spare Back entry can't be removed then without navigating, so a Back that spends it carries on.
 *
 * Once the person has chosen to leave (Leave without publishing, or Publish and leave), every catch
 * stands down until the screen is gone: the leave itself (spending the spare Back entry, a full-page
 * link load, the browser going Back) must not open the prompt, or the browser's, a second time.
 */
/** How long a chosen leave has to take the person off the screen before the guard comes back on. */
export const LEAVE_SETTLE_MS = 1500;

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
  // Set when the person chose to leave. Kept apart from `activeRef`, which every render resets to
  // `active` (still true until the screen unmounts, since leaving without publishing keeps the
  // changes unpublished): a render between the choice and the leave's own popstate or unload would
  // otherwise re-arm the guard and ask again.
  const leavingRef = React.useRef(false);
  /** The spare history entry the browser's Back spends (see below). */
  const sentinelRef = React.useRef(false);
  React.useEffect(() => {
    if (!active) leavingRef.current = false;
  }, [active]);
  // A leave that went nowhere (Back with no page before this one) must not leave the guard off for
  // the rest of the visit: once it has had time to navigate and the screen is still here, at the
  // same URL, the guard comes back on. So does a page the browser restores from its cache.
  const mountedRef = React.useRef(true);
  const settleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rearm = React.useCallback(() => {
    if (!mountedRef.current || !leavingRef.current) return;
    leavingRef.current = false;
    if (activeRef.current && !sentinelRef.current) {
      window.history.pushState({ rankingLeaveGuard: true }, '', window.location.href);
      sentinelRef.current = true;
    }
  }, []);
  React.useEffect(() => {
    mountedRef.current = true;
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) rearm();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      mountedRef.current = false;
      if (settleTimer.current) clearTimeout(settleTimer.current);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [rearm]);

  /** Runs `leave` now, or once the person has chosen in the prompt. */
  const guard = React.useCallback((leave: () => void) => {
    if (!activeRef.current || leavingRef.current) {
      leave();
      return;
    }
    setPending(() => leave);
  }, []);

  // Tab close and reload.
  React.useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
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
      if (leavingRef.current || event.defaultPrevented || event.button !== 0) return;
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
  // The address as of the last render, and the one Back left. The screen rewrites its query in place
  // (the ranking filters, GEO-3774), which changes only the spare entry: the one under it keeps the
  // query from when the guard armed. Staying after a caught Back puts the left address back, or the
  // filters would quietly revert to that older query.
  const hrefRef = React.useRef('');
  const leftHrefRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    hrefRef.current = window.location.href;
  });
  React.useEffect(() => {
    if (!active || sentinelRef.current) return;
    window.history.pushState({ rankingLeaveGuard: true }, '', window.location.href);
    sentinelRef.current = true;
  }, [active]);

  React.useEffect(() => {
    const onPopState = () => {
      if (leavingRef.current) return;
      if (!activeRef.current) {
        if (sentinelRef.current) {
          sentinelRef.current = false;
          window.history.back();
        }
        return;
      }
      sentinelRef.current = false;
      leftHrefRef.current = hrefRef.current || null;
      setPending(() => () => window.history.back());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const close = (keepRanking: boolean) => {
    setPending(null);
    // Back spent the spare entry; staying needs it again so the next Back is caught too.
    if (keepRanking && activeRef.current && !leavingRef.current && !sentinelRef.current) {
      window.history.pushState({ rankingLeaveGuard: true }, '', leftHrefRef.current ?? window.location.href);
      sentinelRef.current = true;
    }
    leftHrefRef.current = null;
  };

  const leaveNow = (leave: () => void) => {
    leavingRef.current = true;
    setPending(null);
    const from = window.location.href;
    const run = () => {
      leave();
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        // Still on this screen at the same URL: the leave went nowhere.
        if (window.location.href === from) rearm();
      }, LEAVE_SETTLE_MS);
    };
    // A spare entry still in place would make Back land on this screen again: spend it first (it is
    // this same URL, so nothing navigates), then leave once the browser says it's gone.
    if (sentinelRef.current) {
      sentinelRef.current = false;
      window.addEventListener('popstate', run, { once: true });
      window.history.back();
      return;
    }
    run();
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
