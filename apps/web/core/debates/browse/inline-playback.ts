import * as React from 'react';

import { atom, useAtomValue } from 'jotai';

import { store } from '~/core/state/jotai-store';

/**
 * Set when a debater tile enters full screen, which the players never request: the webview (e.g.
 * TikTok on iOS) has inline playback off, so feed players switch to the combined video.
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

/** Whether this full-screen start is iOS refusing inline playback on a debater tile. */
export function isDebaterTileFullscreen(target: EventTarget | null): target is WebKitVideo {
  return target instanceof HTMLVideoElement && target.closest('[data-debate-slot]') !== null;
}

/**
 * Pause and close the tile's video, then set the flag once it has left full screen: replacing the
 * player while its video is still full screen leaves iOS black. Past the retry limit the viewer's
 * own close (`webkitendfullscreen`) still sets it.
 */
function onBeginFullscreen(event: Event) {
  const video = event.target;
  if (!isDebaterTileFullscreen(video) || closing.has(video)) return;
  closing.add(video);
  video.pause();

  const finish = () => {
    video.removeEventListener('webkitendfullscreen', finish);
    closing.delete(video);
    store.set(inlinePlaybackUnavailableAtom, true);
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

/** Installed once for the page. The event does not bubble, hence capture. */
function listen() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('webkitbeginfullscreen', onBeginFullscreen, true);
}

/** Whether feed players should show the combined video. Starts the page's listener. */
export function useInlinePlaybackUnavailable(): boolean {
  React.useEffect(listen, []);
  return useAtomValue(inlinePlaybackUnavailableAtom);
}
