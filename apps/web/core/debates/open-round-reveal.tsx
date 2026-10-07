'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import type { OpenRoundPick } from './api';
import { recordingLabelTextShadow, recordingOverlayTextShadow } from './debate-video-tile';

/**
 * The Open rounds reveal (GEO-3179): the 3 s result window after a round resolves, on both screens
 * at once because both time it from the server's `decision_resolved_at`.
 *
 * - `flip`: each tile's card turns from the debater's name to their pick.
 * - `result`: what the picks mean. Two Extends: "Round N" and who opens it. Anything else: "That's a
 *   wrap", with the picks left up so the split explains itself.
 * - `countIn`: Extend only. The opener gets the room's usual count-in into the new round.
 */
export type OpenRoundRevealStep = 'flip' | 'result' | 'countIn';

/** When the picks have turned and settled, and the result takes over. */
export const OPEN_ROUND_FLIP_MS = 1_100;
/** When an Extend's result gives way to the opener's count-in. */
export const OPEN_ROUND_COUNT_IN_MS = 2_100;

export function openRoundRevealStep(elapsedMs: number, outcome: OpenRoundPick): OpenRoundRevealStep {
  if (elapsedMs < OPEN_ROUND_FLIP_MS) return 'flip';
  if (outcome === 'extend' && elapsedMs >= OPEN_ROUND_COUNT_IN_MS) return 'countIn';
  return 'result';
}

/**
 * The reveal step for a result window `elapsedMs` into it, or `null` outside one.
 *
 * The room's countdown only ticks every 500 ms, which would let the two screens change step up to
 * half a second apart. This schedules its own re-render at each step boundary instead, measured from
 * the last `elapsedMs` the room gave it.
 */
export function useOpenRoundRevealStep(elapsedMs: number | null, outcome: OpenRoundPick | null) {
  const [reached, setReached] = React.useState<{ from: number; to: number } | null>(null);
  const effectiveMs = elapsedMs === null ? null : reached?.from === elapsedMs ? reached.to : elapsedMs;

  React.useEffect(() => {
    if (elapsedMs === null || effectiveMs === null) return;
    const next = [OPEN_ROUND_FLIP_MS, OPEN_ROUND_COUNT_IN_MS].find(boundary => boundary > effectiveMs);
    if (next === undefined) return;
    const timer = window.setTimeout(() => setReached({ from: elapsedMs, to: next }), next - effectiveMs);
    return () => window.clearTimeout(timer);
  }, [elapsedMs, effectiveMs]);

  if (effectiveMs === null || outcome === null) return null;
  return openRoundRevealStep(effectiveMs, outcome);
}

/**
 * One debater's pick, as a card over their tile that flips once, on mount, from their name to the
 * pick. A missing pick counted as End, so it flips to End and says it was no pick, which is what
 * makes it clear why the debate ended.
 *
 * `placement` moves the card off the tile's centre while result text is up between the two tiles:
 * the upper tile's card rises, the lower one's drops.
 */
export function OpenRoundPickReveal({
  name,
  pick,
  placement = 'center',
}: {
  name: string;
  pick: OpenRoundPick | null;
  placement?: 'center' | 'raised' | 'lowered';
}) {
  const word = pick === 'extend' ? 'Extend' : 'End';
  return (
    <div
      aria-hidden="true"
      data-open-round-reveal={pick ?? 'none'}
      className={cx(
        'pointer-events-none absolute left-1/2 z-[35] h-[3.75rem] w-32 -translate-x-1/2 -translate-y-1/2 transition-[top] duration-300 perspective-[600px] motion-reduce:transition-none',
        placement === 'raised' ? 'top-[36%]' : placement === 'lowered' ? 'top-[66%]' : 'top-1/2'
      )}
    >
      <div className="relative h-full w-full rotate-y-180 transform-3d motion-safe:animate-open-round-flip">
        <div className="absolute inset-0 grid place-items-center rounded-lg bg-white bg-[repeating-linear-gradient(45deg,var(--color-grey-01)_0_6px,var(--color-white)_6px_12px)] px-2 shadow-card backface-hidden">
          <Text variant="metadataMedium" color="grey-04" className="max-w-full truncate">
            {name}
          </Text>
        </div>
        <div
          className={cx(
            'absolute inset-0 flex rotate-y-180 flex-col items-center justify-center rounded-lg px-2 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backface-hidden',
            pick === 'extend' ? 'bg-purple' : 'bg-text'
          )}
        >
          <span className="max-w-full truncate text-[0.6875rem] leading-[0.8125rem] font-medium tracking-[0.06em] uppercase opacity-80">
            {pick === null ? 'No pick' : name}
          </span>
          <span className="text-[1.375rem] leading-6 font-bold tracking-[0.04em] uppercase">{word}</span>
        </div>
      </div>
    </div>
  );
}

export type OpenRoundResult =
  | { kind: 'round'; round: number; opener: string }
  | { kind: 'wrap'; note: string | null }
  | { kind: 'max'; rounds: number };

/**
 * What a round's resolution means, over the middle of the two tiles: a new round and who opens it,
 * the end of the debate, or the cap. It sits on the gap between the tiles, which is where the
 * room's other cards go, and the tiles hide their chips while it is up so the two never meet.
 */
export function OpenRoundResultOverlay({ result }: { result: OpenRoundResult }) {
  const pill =
    result.kind === 'round'
      ? result.opener === 'You'
        ? 'You open'
        : `${result.opener} opens`
      : result.kind === 'wrap'
        ? result.note
        : `${result.rounds} rebuttal rounds`;

  return (
    <div data-open-round-result={result.kind} className="pointer-events-none absolute inset-0 z-[45]">
      {result.kind === 'round' && (
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-lg motion-reduce:hidden">
          <div className="absolute top-1/2 left-1/2 -mt-[260px] -ml-[260px] h-[520px] w-[520px] bg-[repeating-conic-gradient(from_0deg,rgb(104_51_255/0.5)_0_7deg,transparent_7deg_18deg)] [mask-image:radial-gradient(circle,#000_0_18%,transparent_55%)] motion-safe:animate-open-round-burst" />
        </div>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        {result.kind === 'round' ? (
          <>
            <div
              className="text-recordingLabel text-text motion-safe:animate-open-round-slam"
              style={recordingLabelTextShadow}
            >
              Round
            </div>
            <div
              className="mt-1 text-[7.5rem] leading-[0.85] font-bold text-white motion-safe:animate-open-round-slam"
              style={recordingOverlayTextShadow}
            >
              {result.round}
            </div>
          </>
        ) : (
          <div
            className="text-recordingLabel text-text motion-safe:animate-open-round-slam"
            style={recordingLabelTextShadow}
          >
            {result.kind === 'wrap' ? "That's a wrap" : "That's the max"}
          </div>
        )}
        {pill && (
          <Text
            color="white"
            variant="metadata"
            className="mt-3 max-w-full rounded-xl border border-white/40 bg-black/70 px-3 py-1.5 text-balance shadow-light"
          >
            {pill}
          </Text>
        )}
      </div>
    </div>
  );
}

/** Why a debate ended, when the reason is a missing pick. A split needs no line: the cards say it. */
export function openRoundWrapNote(
  localPick: OpenRoundPick | null | undefined,
  remote: { name: string; pick: OpenRoundPick | null | undefined }
) {
  const localMissed = localPick === null;
  const remoteMissed = remote.pick === null;
  if (localMissed && remoteMissed) return 'No picks in time';
  if (localMissed) return "You didn't pick in time";
  if (remoteMissed) return `${remote.name} didn't pick in time`;
  return null;
}
