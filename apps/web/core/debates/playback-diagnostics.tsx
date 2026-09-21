'use client';

import * as React from 'react';

import { useIsomorphicLayoutEffect } from '~/core/hooks/use-isomorphic-layout-effect';
import { readStoredFeatureFlag, usePlaybackDiagnosticsEnabled } from '~/core/state/feature-flags';
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

const DEBATE_PLAYER_SELECTOR = '[data-debate-ready]';

function describe(video: HTMLVideoElement, label: string) {
  const shown = shownFraction(video);
  const calls = traces.get(video) ?? [];

  return [
    label,
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

  /*
   * The trace is installed before any playback effect can run, and deliberately not on `enabled`.
   *
   * `enabled` comes from a hydration-gated read, so it is `false` for the first commit by design.
   * Waiting for it would leave the patch to a passive effect that runs alongside `DebateFeedPlayer`'s
   * own — and if the card gets there first, its `play()` is never recorded. The readout would then
   * say `calls=[]`, which does not mean "not recorded": it means "nothing ever asked this to play",
   * a different fault in a different part of the code. Sending this investigation somewhere it did
   * not need to go is the one thing this file exists to prevent.
   *
   * So the flag is read straight from storage, in a layout effect. Layout effects run during commit,
   * ahead of every passive effect in the tree, which is what makes the ordering a guarantee rather
   * than a race this usually wins. Only the patch runs early; the panel stays hydration-gated.
   */
  useIsomorphicLayoutEffect(() => {
    if (readStoredFeatureFlag('playbackDiagnostics')) patchMediaElement();
  }, []);

  React.useEffect(() => {
    if (!enabled) return;

    // Idempotent, and this is the path that matters when the flag is switched on mid-session.
    patchMediaElement();

    const read = () => {
      const all = [...document.querySelectorAll('video')];
      const visible = all.filter(isReallyVisible);
      // Every visible card, not the first two. The panel scrolls inside its own height limit, and
      // a reading that quietly omits the third card on screen is a reading that can be wrong about
      // which card is misbehaving — the failure this whole file exists to prevent.
      const players = [...document.querySelectorAll(DEBATE_PLAYER_SELECTOR)].filter(isReallyVisible);

      /*
       * Each card reports its own videos, underneath it.
       *
       * The conclusion and the videos it is about used to be two lists built independently and
       * lined up by position — `card0` beside `v0`, which was whatever came first in the
       * document. Explore opens with a hero carousel above the feed, and any entity page can
       * carry video of its own, so `v0` was regularly some unrelated element while `card0`
       * described a debate below it. That reads as a card playing a video it has never touched,
       * and this readout exists precisely because wrong measurements sent this investigation
       * after causes that were never there.
       *
       * So the pairing is structural now: a card's videos are the ones inside it.
       */
      const cards = players.flatMap((player, index) => [
        `card${index} · ready=${player.getAttribute('data-debate-ready')}` +
          ` active=${player.getAttribute('data-debate-active')}` +
          ` playing=${player.getAttribute('data-debate-playing')}` +
          ` blocked=${player.getAttribute('data-debate-autoplay-blocked')}` +
          ` playBtn=${player.querySelectorAll('[aria-label="Resume debate"]').length}`,
        ...[...player.querySelectorAll('video')].map((video, slot) => `  ${describe(video, `card${index}.v${slot}`)}`),
      ]);

      // Media the debate feed does not own still matters — it competes for the same decoders —
      // but it is counted, not described, so it can never be mistaken for a card's own video.
      const strays = visible.filter(video => video.closest(DEBATE_PLAYER_SELECTOR) === null);
      const offScreenButPlaying = all.filter(video => !video.paused && !isReallyVisible(video));

      setLines([
        `${all.length} video(s) on the page, ${visible.length} on screen, ${all.filter(v => !v.paused).length} playing`,
        ...(cards.length > 0 ? cards : ['no debate player on screen']),
        ...(strays.length > 0
          ? [
              `${strays.length} other video(s) on screen, outside any debate card (${strays.filter(v => !v.paused).length} playing)`,
            ]
          : []),
        // A video running where nobody can see it is its own fault and worth naming separately.
        ...offScreenButPlaying.map(
          (video, index) => `off-screen but playing #${index} · t=${video.currentTime.toFixed(1)}`
        ),
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
      {lines.map((line, index) => (
        // Keyed by position: this is a readout regenerated whole every 500ms, and two cards in
        // the same state produce byte-identical rows.
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}
