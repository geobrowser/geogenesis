import * as React from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';

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

/** Videos being closed. Shared, as every mounted player listens: one of them handles each video. */
const closing = new WeakSet<HTMLVideoElement>();

/** Whether this full-screen start is iOS refusing inline playback on a debater tile. */
export function isDebaterTileFullscreen(target: EventTarget | null): target is WebKitVideo {
  return target instanceof HTMLVideoElement && target.closest('[data-debate-slot]') !== null;
}

/**
 * Reads the flag; sets it once a debater tile that entered full screen has been closed. The event
 * does not bubble, hence capture. Unmounting the player while still full screen leaves iOS black.
 */
export function useInlinePlaybackUnavailable(): boolean {
  const unavailable = useAtomValue(inlinePlaybackUnavailableAtom);
  const setUnavailable = useSetAtom(inlinePlaybackUnavailableAtom);

  React.useEffect(() => {
    if (unavailable) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const onBeginFullscreen = (event: Event) => {
      const video = event.target;
      if (!isDebaterTileFullscreen(video) || closing.has(video)) return;
      closing.add(video);
      video.pause();

      let attempts = 0;
      const finish = () => {
        video.removeEventListener('webkitendfullscreen', finish);
        closing.delete(video);
        setUnavailable(true);
      };
      const exit = () => {
        if (!video.webkitDisplayingFullscreen || attempts >= EXIT_RETRY_LIMIT) return finish();
        attempts++;
        video.pause();
        try {
          video.webkitExitFullscreen?.();
        } catch {
          // Still entering; asked again below.
        }
        const timer = setTimeout(() => {
          timers.delete(timer);
          exit();
        }, EXIT_RETRY_MS);
        timers.add(timer);
      };
      video.addEventListener('webkitendfullscreen', finish);
      const timer = setTimeout(() => {
        timers.delete(timer);
        exit();
      }, EXIT_DELAY_MS);
      timers.add(timer);
    };
    document.addEventListener('webkitbeginfullscreen', onBeginFullscreen, true);
    return () => {
      document.removeEventListener('webkitbeginfullscreen', onBeginFullscreen, true);
      for (const timer of timers) clearTimeout(timer);
    };
  }, [unavailable, setUnavailable]);

  return unavailable;
}
