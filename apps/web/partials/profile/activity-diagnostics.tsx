'use client';

import * as React from 'react';

/**
 * What the Activity gallery is actually doing, on the device it is doing it on
 * (GEO-2974).
 *
 * Three faults were reported from a phone — autoplay that needs two taps, the
 * page moving when the kinds are swapped, and the gallery losing its place when
 * a claim opens. None of the three reproduces headlessly: Chromium played every
 * card on every swipe, WebKit reported `paused: false` with the clock advancing
 * and `play()` resolving, and both kept their scroll positions through a switch
 * and through opening the panel.
 *
 * That is not evidence the faults are imagined. It is evidence that the things
 * causing them are the things headless engines do not have — iOS media policy,
 * Low Power Mode, a toolbar that resizes the viewport as you scroll, real touch
 * momentum. So rather than keep guessing at fixes for symptoms nobody can
 * reproduce, this reports the state that would tell them apart, on the phone
 * where they happen.
 *
 * **What to look for, for the autoplay report specifically.** The reported
 * sequence — tap once and a play button appears, tap again and it plays — says
 * the app believed it was already playing while the element was not: the first
 * tap *paused* something. So the row to read is `paused` against `app`. If
 * `paused: true` shows while the card claims to be playing, the initial `play()`
 * was refused and the refusal never reached the UI, and the fix is to make the
 * player's visible state follow the element rather than the intention. If
 * `paused: false` with `t` frozen, the element is running and not decoding,
 * which is a different fix entirely.
 *
 * Behind a flag rather than a query param so it survives the navigation into a
 * side panel and back, which is one of the things being measured.
 */
type VideoState = {
  paused: boolean;
  muted: boolean;
  inline: boolean;
  ready: number;
  t: number;
  err: number | null;
};

type Snapshot = {
  pageY: number;
  galleryX: number | null;
  galleryH: number | null;
  docH: number;
  viewportH: number;
  videos: VideoState[];
  lastPlay: string | null;
};

/** Set by the patch below, so a refusal the app swallowed is still visible. */
declare global {
  var __geoLastPlayOutcome: string | null | undefined;
}

/**
 * Records how the last `play()` resolved.
 *
 * A rejected `play()` is the single most likely explanation for the reported
 * two-tap sequence, and it is invisible from the outside — the promise is
 * usually handed to a `.catch` that sets state the card may not render. This
 * patches the prototype once and writes the outcome where the readout can see
 * it, without changing what any caller receives.
 */
function recordPlayOutcomes() {
  const proto = HTMLMediaElement.prototype as HTMLMediaElement & { __geoPatched?: boolean };
  if (proto.__geoPatched) return;
  proto.__geoPatched = true;

  const original = proto.play;
  proto.play = function patched(this: HTMLMediaElement) {
    const result = original.call(this);

    if (result && typeof result.then === 'function') {
      result.then(
        () => {
          globalThis.__geoLastPlayOutcome = 'resolved';
        },
        (error: unknown) => {
          const name = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          globalThis.__geoLastPlayOutcome = `REJECTED ${name}`;
        }
      );
    }

    return result;
  };
}

export function ActivityDiagnostics({ galleryRef }: { galleryRef: React.RefObject<HTMLDivElement | null> }) {
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);

  React.useEffect(() => {
    recordPlayOutcomes();

    const read = () => {
      const scroller = galleryRef.current?.querySelector('[data-activity-card]')?.parentElement ?? null;

      setSnapshot({
        pageY: Math.round(window.scrollY),
        galleryX: scroller ? Math.round(scroller.scrollLeft) : null,
        galleryH: galleryRef.current ? Math.round(galleryRef.current.getBoundingClientRect().height) : null,
        docH: document.documentElement.scrollHeight,
        viewportH: window.innerHeight,
        videos: [...document.querySelectorAll('video')].slice(0, 2).map(video => ({
          paused: video.paused,
          muted: video.muted,
          inline: video.playsInline,
          ready: video.readyState,
          t: +video.currentTime.toFixed(1),
          err: video.error?.code ?? null,
        })),
        lastPlay: globalThis.__geoLastPlayOutcome ?? null,
      });
    };

    read();
    const interval = window.setInterval(read, 500);

    return () => window.clearInterval(interval);
  }, [galleryRef]);

  if (!snapshot) return null;

  return (
    <div className="border-t border-divider bg-grey-01 px-4 py-2 font-mono text-[11px] leading-snug text-grey-04">
      <div>
        pageY {snapshot.pageY} · doc {snapshot.docH} · vh {snapshot.viewportH} · maxY{' '}
        {snapshot.docH - snapshot.viewportH}
      </div>
      <div>
        galleryX {snapshot.galleryX ?? '—'} · galleryH {snapshot.galleryH ?? '—'}
      </div>
      {snapshot.videos.map((video, index) => (
        <div key={index}>
          v{index} {video.paused ? 'PAUSED' : 'playing'} · t {video.t} · ready {video.ready} ·{' '}
          {video.muted ? 'muted' : 'audible'} · {video.inline ? 'inline' : 'NOT-INLINE'}
          {video.err === null ? '' : ` · err ${video.err}`}
        </div>
      ))}
      <div>play(): {snapshot.lastPlay ?? 'not called yet'}</div>
    </div>
  );
}
