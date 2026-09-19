'use client';

import * as React from 'react';

import { usePlaybackDiagnosticsEnabled } from '~/core/state/feature-flags';
import { errorName } from '~/core/utils/error-name';

/**
 * Why a debate video on screen is not playing, answered on the device it is not
 * playing on (GEO-2978).
 *
 * Autoplay faults here do not reproduce anywhere a debugger is attached.
 * Headless Chromium plays every card, and headless WebKit — the engine iOS runs
 * — reports the clock advancing and `play()` resolving, because neither carries
 * iOS's media policy, Low Power Mode, or a toolbar that resizes the viewport as
 * you scroll. The phone is the only witness, so this asks it.
 *
 * It separates causes that look identical on screen:
 *
 *   * `calls=[]` — nothing asked it to play, so the fault is in whatever decides
 *     a card is active.
 *   * `calls=[play REJECTED:…]` — the browser refused.
 *   * `calls=[play ok]` with `PAUSED`, or playing with a frozen `t` — something
 *     took it back, or it cannot decode.
 *
 * Read the app's own conclusion beside them: a card reporting `playing=true`
 * over a refused `play()` is the pair that produced GEO-2978, where a
 * synchronous un-pause inside `play()` was mistaken for a successful start.
 */
type Trace = string[];

const traces = new WeakMap<HTMLMediaElement, Trace>();
let patched = false;

/**
 * Records every `play()` and `pause()` against the element it happened to.
 *
 * Patched once on the prototype rather than per element: the cards mount and
 * unmount as the feed scrolls, and an element that was never wrapped is exactly
 * the one whose silence needs explaining. Never unpatched — turning the flag off
 * leaves the wrapper in place until the next page load, which costs a push to a
 * `WeakMap` per call and keeps the trace intact for a reading taken right after.
 */
function patchMediaElement() {
  if (patched || typeof HTMLMediaElement === 'undefined') return;
  patched = true;

  const note = (element: HTMLMediaElement, entry: string) => {
    const trace = traces.get(element) ?? [];
    trace.push(entry);
    traces.set(element, trace.slice(-6));
  };

  const originalPlay = HTMLMediaElement.prototype.play;
  const originalPause = HTMLMediaElement.prototype.pause;

  HTMLMediaElement.prototype.play = function patchedPlay(this: HTMLMediaElement) {
    note(this, 'play');
    const result = originalPlay.call(this);

    if (result && typeof result.then === 'function') {
      result.then(
        () => note(this, 'ok'),
        // Structurally, not behind `instanceof Error`: `play()` rejects with a `DOMException`,
        // and reporting the refusal that matters as `unknown` would waste the whole reading.
        (error: unknown) => note(this, `REJECTED:${errorName(error)}`)
      );
    }

    return result;
  };

  HTMLMediaElement.prototype.pause = function patchedPause(this: HTMLMediaElement) {
    note(this, 'pause');
    return originalPause.call(this);
  };
}

/**
 * How much of an element is on screen, as a fraction of itself.
 *
 * **Both axes.** A card scrolled out sideways in a horizontal row is not on
 * screen, and a vertical-only test calls it visible — which is exactly how a
 * gallery's off-screen cards came to be counted as playing and sent an
 * investigation after a decoder limit that was never reached.
 */
function shownFraction(element: Element) {
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return 0;

  const vertical = Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0));
  const horizontal = Math.max(0, Math.min(box.right, window.innerWidth) - Math.max(box.left, 0));

  return (vertical * horizontal) / (box.width * box.height);
}

const isReallyVisible = (element: Element) => shownFraction(element) > 0;

function describe(video: HTMLVideoElement, index: number) {
  const shown = shownFraction(video);
  const calls = traces.get(video) ?? [];

  return [
    `v${index}`,
    `${Math.round(shown * 100)}% shown`,
    video.paused ? 'PAUSED' : 'playing',
    `t=${video.currentTime.toFixed(1)}`,
    `ready=${video.readyState}`,
    video.muted ? 'muted' : 'AUDIBLE',
    video.playsInline ? 'inline' : 'NOT-INLINE',
    video.error ? `err=${video.error.code}` : null,
    `calls=[${calls.join(' ')}]`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function PlaybackDiagnostics() {
  const enabled = usePlaybackDiagnosticsEnabled();
  const [lines, setLines] = React.useState<string[]>([]);
  const [copied, setCopied] = React.useState(false);

  // The confirmation has to expire, or the button reads "copied" over a readout that has moved on
  // since — and this one repaints every 500ms.
  React.useEffect(() => {
    if (!copied) return;

    const timeout = window.setTimeout(() => setCopied(false), 1_500);

    return () => window.clearTimeout(timeout);
  }, [copied]);

  React.useEffect(() => {
    if (!enabled) return;

    patchMediaElement();

    const read = () => {
      const all = [...document.querySelectorAll('video')];
      const visible = all.filter(isReallyVisible);

      /*
       * The player's own conclusion, read off the attributes it publishes.
       *
       * The trace above says what the browser did; this says what the app made
       * of it, and the gap between the two is where these faults live.
       */
      const players = [...document.querySelectorAll('[data-debate-ready]')]
        .filter(isReallyVisible)
        .slice(0, 2)
        .map(
          (player, index) =>
            `card${index} · ready=${player.getAttribute('data-debate-ready')}` +
            ` active=${player.getAttribute('data-debate-active')}` +
            ` playing=${player.getAttribute('data-debate-playing')}` +
            ` blocked=${player.getAttribute('data-debate-autoplay-blocked')}` +
            ` playBtn=${player.querySelectorAll('[aria-label="Resume debate"]').length}`
        );

      setLines([
        `${all.length} video(s) on the page, ${visible.length} on screen, ${all.filter(v => !v.paused).length} playing`,
        ...(players.length > 0 ? players : ['no debate player on screen']),
        ...visible.slice(0, 4).map((video, index) => describe(video, index)),
        // A video running where nobody can see it is its own fault and worth
        // naming separately.
        ...all
          .filter(video => !video.paused && !isReallyVisible(video))
          .slice(0, 2)
          .map((video, index) => `off-screen but playing #${index} · t=${video.currentTime.toFixed(1)}`),
      ]);
    };

    read();
    const interval = window.setInterval(read, 500);

    return () => window.clearInterval(interval);
  }, [enabled]);

  if (!enabled) return null;

  const text = lines.join('\n');

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999] max-h-[45vh] overflow-y-auto border-t-2 border-red-01 bg-white/95 px-3 py-2 font-mono text-[10px] leading-snug text-text">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-bold">playback diagnostics</span>
        <button
          type="button"
          className="rounded border border-grey-02 px-2 py-1 text-[10px]"
          onClick={() => {
            // `writeText` is the whole reason this is a button: reading the
            // numbers off a phone screenshot loses the part that matters, which
            // is the call trace.
            void navigator.clipboard?.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false)
            );
          }}
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      {lines.map(line => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}
