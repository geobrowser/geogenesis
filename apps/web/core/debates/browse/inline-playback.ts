import * as React from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';

/**
 * Whether this page cannot play video inline, so the feed players show the combined debate video
 * instead of the two debaters side by side.
 *
 * Some in-app browsers (TikTok on iOS) host the page in a WKWebView with inline playback off. iOS
 * then ignores `playsinline` and opens every `play()` in its native full-screen player, which
 * shows one debater with none of the player's overlays. Nothing reports the setting, so it is
 * learned from the first debater video that enters full screen: the players never ask for it.
 * Kept for the rest of the page's life.
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
 * Reads the flag, and sets it when a debater tile's video enters full screen.
 *
 * The event does not bubble, so it is caught on the capture phase. The video is paused and closed,
 * and the flag is set only once it has left full screen: iOS ignores an exit asked for while it is
 * still entering, so the exit is retried, and replacing the player while its video is full screen
 * leaves a black full-screen view with nothing in it.
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
