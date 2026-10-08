'use client';

import * as React from 'react';

/**
 * How much of the bottom of the viewport is taken by global floating chrome — the flow bar's
 * "Review edits" pill, the debate upload banner — published as the `--app-bottom-inset` custom
 * property on the document root.
 *
 * Surfaces anchored to the bottom of the viewport read it back so they sit above that chrome
 * instead of underneath it: the dropdown placement hook subtracts it from the space below an
 * anchor, and the assistant launcher and panel add it to their own offset.
 *
 * A registry rather than a bare `setProperty`, because more than one bar can be up at once — the
 * flow bar over a space with unsaved edits while a debate recording finishes uploading, say. The
 * tallest wins, and a bar leaving must uncover the next tallest rather than clearing the property
 * out from under it.
 */
const contributors = new Map<string, number>();
const subscribers = new Set<() => void>();

function publishBottomInset() {
  const root = document.documentElement;
  const tallest = contributors.size === 0 ? 0 : Math.max(...contributors.values());
  // Read the property back rather than caching the last published value, so a test or a stylesheet
  // that sets it directly can't desync this from what is actually on the element.
  const previous = readAppBottomInset();
  if (tallest > 0) {
    root.style.setProperty('--app-bottom-inset', `${tallest}px`);
  } else {
    root.style.removeProperty('--app-bottom-inset');
  }
  if (tallest === previous) return;
  // A copy, so a subscriber that unsubscribes while being notified can't mutate the set underfoot.
  for (const notify of [...subscribers]) notify();
}

/**
 * Run `onChange` whenever the published inset changes, returning an unsubscribe.
 *
 * Surfaces that consume the inset in CSS need nothing — the custom property re-resolves on its
 * own. This is for the ones that read it into JavaScript: a measurement taken when a dropdown
 * opened is stale the moment a bar appears underneath it, and a custom property changing fires no
 * DOM event to notice that from.
 */
export function subscribeAppBottomInset(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}

/**
 * Claim `height` pixels of the bottom of the viewport under `key` for as long as `active`.
 *
 * `key` identifies the bar, not the instance: a bar renders once, and a stable key is what lets
 * the registry replace its own entry rather than accumulate one per mount.
 */
export function useAppBottomInset(key: string, height: number, active: boolean) {
  // A layout effect, not an effect: dropdowns decide their placement in their own layout effect
  // during the same commit, and would otherwise measure against a stale inset for a frame.
  React.useLayoutEffect(() => {
    if (!active) return;
    contributors.set(key, height);
    publishBottomInset();
    return () => {
      contributors.delete(key);
      publishBottomInset();
    };
  }, [active, height, key]);
}

/** The current `--app-bottom-inset` in pixels. 0 when unset, unparseable, or server-side. */
export function readAppBottomInset(): number {
  if (typeof document === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--app-bottom-inset').trim();
  if (!raw) return 0;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * How far above the bottom edge a pinned surface has to sit: clear of the device safe area, and
 * clear of whatever global chrome is currently claiming the bottom of the viewport.
 *
 * Spelled out again inside each class below rather than interpolated, because Tailwind finds
 * classes by scanning source text and cannot resolve a template hole. The "size and offset against
 * the same expression" case in `app-bottom-inset.test.tsx` is what holds the copies together.
 */
export const BOTTOM_INSET_OFFSET_EXPRESSION = 'max(1rem,env(safe-area-inset-bottom))+var(--app-bottom-inset,0px)';

/** Tailwind offset for a surface pinned to the bottom of the viewport. */
export const BOTTOM_INSET_OFFSET_CLASS =
  'bottom-[calc(max(1rem,env(safe-area-inset-bottom))+var(--app-bottom-inset,0px))]';

/**
 * Ceiling for a surface sitting at that offset: the rest of the viewport above it, and no more.
 *
 * It has to subtract the whole offset, not just its `1rem` floor — on a device whose bottom safe
 * area is taller than 1rem, a panel sized against the smaller figure hangs off the top of the
 * screen by the difference.
 */
export const BOTTOM_INSET_MAX_HEIGHT_CLASS =
  'max-h-[calc(100dvh-(max(1rem,env(safe-area-inset-bottom))+var(--app-bottom-inset,0px)))]';
