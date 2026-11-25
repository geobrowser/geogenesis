'use client';

import * as React from 'react';

import { APP_NAVBAR_HEIGHT } from '~/partials/entity-page/entity-sticky-header-host';

/**
 * Explore scrolls a card at a time (GEO-3867), as the debates app's feed does
 * (debates-react-native `feedSnap.web.ts`): each card comes to rest in the middle of what the navbar
 * leaves showing, and a swipe, a wheel gesture or a key press stops at the next card rather than
 * flying past several. One card in the middle at a time is also what lets one of them play.
 *
 * The page scrolls the window, so the snap is set on the document while the feed is mounted and
 * taken off when it leaves. The body snaps by its top so the header and filters above the first
 * card stay reachable, and the end of the list (`FEED_SNAP_END_CLASS_NAME`) by its bottom so the
 * loader and "Could not load more" are.
 */
export function useFeedSnap(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    const body = document.body;
    const previous = {
      type: root.style.scrollSnapType,
      paddingTop: root.style.scrollPaddingTop,
      paddingBottom: root.style.scrollPaddingBottom,
      bodyAlign: body.style.scrollSnapAlign,
    };
    root.style.scrollSnapType = 'y mandatory';
    root.style.scrollPaddingTop = `${APP_NAVBAR_HEIGHT}px`;
    // Above the floating bars (the flow bar's pill, the upload banner); see `app-bottom-inset.ts`.
    root.style.scrollPaddingBottom = 'var(--app-bottom-inset, 0px)';
    body.style.scrollSnapAlign = 'start';
    return () => {
      root.style.scrollSnapType = previous.type;
      root.style.scrollPaddingTop = previous.paddingTop;
      root.style.scrollPaddingBottom = previous.paddingBottom;
      body.style.scrollSnapAlign = previous.bodyAlign;
    };
  }, [enabled]);
}

/** On each card's slot: rest in the middle, and never be scrolled past in one gesture. */
export const FEED_SNAP_ITEM_CLASS_NAME = 'snap-center snap-always';

/** On the end of the list, so what follows the last card can be scrolled to. */
export const FEED_SNAP_END_CLASS_NAME = 'snap-end';
