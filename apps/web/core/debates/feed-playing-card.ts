'use client';

import * as React from 'react';

import { APP_NAVBAR_HEIGHT } from '~/partials/entity-page/entity-sticky-header-host';

/**
 * The one feed card playing, app-wide (GEO-3867).
 *
 * Each feed card decides for itself whether it is in view enough to play, with hysteresis (see
 * `DebateExploreFeedCard`), so two cards can both qualify at once: the one scrolling out has not
 * fallen to its lower threshold yet when the next reaches its upper one. Muted that was harmless.
 * With sound on it played two debates over each other. So a card that qualifies is only a
 * candidate, and of the candidates the one nearest the middle of the screen plays, as the debates
 * app's feed keeps a single `playing` card.
 *
 * The current card keeps playing until another is clearly nearer the middle ({@link HANDOVER_PX}),
 * so two cards straddling it do not trade playback on every scroll frame.
 */
const HANDOVER_PX = 24;

const candidates = new Map<string, HTMLElement>();
const listeners = new Set<() => void>();
let playing: string | null = null;
let frame = 0;

function distanceFromMiddle(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  // The middle of what the navbar leaves showing.
  const middle = (APP_NAVBAR_HEIGHT + window.innerHeight) / 2;
  return Math.abs(rect.top + rect.height / 2 - middle);
}

function elect() {
  frame = 0;
  let next: string | null = null;
  let nearest = Infinity;
  for (const [owner, element] of candidates) {
    const distance = distanceFromMiddle(element);
    if (distance < nearest) {
      next = owner;
      nearest = distance;
    }
  }
  const current = playing !== null ? candidates.get(playing) : undefined;
  if (current && next !== playing && distanceFromMiddle(current) - nearest <= HANDOVER_PX) next = playing;
  if (next === playing) return;
  playing = next;
  for (const listener of listeners) listener();
}

function onViewportChange() {
  if (frame || candidates.size < 2) return;
  frame = window.requestAnimationFrame(elect);
}

function register(owner: string, element: HTMLElement) {
  if (candidates.size === 0) {
    window.addEventListener('scroll', onViewportChange, { passive: true });
    window.addEventListener('resize', onViewportChange);
  }
  candidates.set(owner, element);
  elect();
}

function unregister(owner: string) {
  candidates.delete(owner);
  if (candidates.size === 0) {
    window.removeEventListener('scroll', onViewportChange);
    window.removeEventListener('resize', onViewportChange);
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }
  elect();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getPlaying = () => playing;
const getServerPlaying = () => null;

/**
 * Whether this feed card is the one playing. `candidate`: it would play if it were the only card,
 * that is, it is in view enough and nothing else holds playback. A card that stops being a
 * candidate, or unmounts, hands playback to the next nearest at once.
 */
export function useFeedPlayingCard(owner: string, element: HTMLElement | null, candidate: boolean): boolean {
  React.useEffect(() => {
    if (!candidate || !element) return;
    register(owner, element);
    return () => unregister(owner);
  }, [candidate, element, owner]);
  const current = React.useSyncExternalStore(subscribe, getPlaying, getServerPlaying);
  return candidate && current === owner;
}
