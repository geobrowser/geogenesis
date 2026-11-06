import * as React from 'react';

import { atom, useAtomValue } from 'jotai';

import { snapshotActionContext } from '~/core/action-context';
import { capture } from '~/core/analytics';
import { store } from '~/core/state/jotai-store';

/**
 * Set when, in TikTok's in-app browser, a debater tile enters full screen, which the players never
 * request: inline playback is off there, so feed players switch to the combined video.
 */
export const inlinePlaybackUnavailableAtom = atom(false);

type WebKitVideo = HTMLVideoElement & { webkitExitFullscreen?: () => void; webkitDisplayingFullscreen?: boolean };

/**
 * How long the native player gets to finish opening before it is asked to close. Closing it while
 * its open animation runs leaves a black full-screen view on iOS, though WebKit reports the exit.
 */
const EXIT_DELAY_MS = 700;
/** How often, and how many times, to ask again if the video is still full screen. */
const EXIT_RETRY_MS = 150;
const EXIT_RETRY_LIMIT = 20;

let listening = false;
const closing = new WeakSet<HTMLVideoElement>();

/** TikTok's in-app browser: `musical_ly_` (global app) or `trill_` (regional app) in the user agent. */
export function isTikTokInAppBrowser(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return /\b(musical_ly|trill)_\d/i.test(userAgent);
}

/** Whether this full-screen start is iOS refusing inline playback on a debater tile. */
export function isDebaterTileFullscreen(target: EventTarget | null): target is WebKitVideo {
  return target instanceof HTMLVideoElement && target.closest('[data-debate-slot]') !== null;
}

/**
 * Close the tile's video, and set the flag only once it has left full screen (by our exit or the
 * viewer's): unmounting a player whose video is full screen leaves iOS black.
 */
function onBeginFullscreen(event: Event) {
  const video = event.target;
  if (!isDebaterTileFullscreen(video) || closing.has(video)) return;
  closing.add(video);
  video.pause();

  const finish = () => {
    video.removeEventListener('webkitendfullscreen', finish);
    closing.delete(video);
    if (store.get(inlinePlaybackUnavailableAtom)) return;
    store.set(inlinePlaybackUnavailableAtom, true);
    captureFallbackShown();
  };
  let attempts = 0;
  const exit = () => {
    if (!video.webkitDisplayingFullscreen) return finish();
    if (attempts++ >= EXIT_RETRY_LIMIT) return;
    video.pause();
    try {
      video.webkitExitFullscreen?.();
    } catch {
      // Still entering; asked again below.
    }
    setTimeout(exit, EXIT_RETRY_MS);
  };
  video.addEventListener('webkitendfullscreen', finish);
  setTimeout(exit, EXIT_DELAY_MS);
}

/** One `component_impression` per page when the feed switches to the combined player. */
function captureFallbackShown() {
  try {
    capture('component_impression', {
      ...snapshotActionContext('debate_combined_player', 'application', 'genesis', {}, {}, { ignoreEventContext: true }),
      presentation_instance_id: crypto.randomUUID(),
      action_context_version: 'v1',
      measurement_version: 'growth-v2',
      fallback_reason: 'inline_playback_unavailable',
    });
  } catch {
    // Analytics never blocks the switch.
  }
}

/** Installed once, and only in TikTok's browser. The event does not bubble, hence capture. */
function listen() {
  if (listening || typeof document === 'undefined' || !isTikTokInAppBrowser()) return;
  listening = true;
  document.addEventListener('webkitbeginfullscreen', onBeginFullscreen, true);
}

/** Whether feed players should show the combined video. Starts the page's listener. */
export function useInlinePlaybackUnavailable(): boolean {
  React.useEffect(listen, []);
  return useAtomValue(inlinePlaybackUnavailableAtom);
}
