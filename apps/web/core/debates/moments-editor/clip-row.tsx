'use client';

import * as React from 'react';

import cx from 'classnames';

import { SmallButton } from '~/design-system/button';
import { Select } from '~/design-system/select';
import { Text } from '~/design-system/text';

import { NEGATIVE_TEXT_CLASS } from '../matchmaking/admin-debate-parts';
import { type EditorClip, type ReelWord, formatReelTime, formatSeconds, parseReelTime, stepEdge } from './reel';

/** A debater's colours in the editor: the avatar palette's two accents, as the prototype has them. */
export const SPEAKER_FILL_CLASS = { 1: 'bg-purple', 2: 'bg-pink' } as const;

/** A claim the clip can be linked to: its position in the debate's claims, and its text. */
export type ClaimOption = { index: number; text: string };

const AUTOMATIC_CLAIM = 'automatic';

type Props = {
  index: number;
  clip: EditorClip;
  speakerSlot: 1 | 2 | null;
  speakerName: string | null;
  quote: string;
  words: readonly ReelWord[];
  /** The speaker's claims, which the clip can be linked to. */
  claims: readonly ClaimOption[];
  /** What stops geo-chat cutting it, found here or reported by the worker. */
  problems: readonly string[];
  readOnly: boolean;
  playheadMs: number | null;
  onChangeEdge: (edge: 'start' | 'end', ms: number, options?: { snap?: boolean }) => void;
  onChangeClaim: (claimIndex: number | null) => void;
  onPlay: () => void;
  onRemove: () => void;
};

/**
 * One clip of the reel (GEO-3671): who it is of, how long it runs, the words it plays, its two edges
 * on the player's clock, and the claim it plays for.
 */
export function ClipRow({
  index,
  clip,
  speakerSlot,
  speakerName,
  quote,
  words,
  claims,
  problems,
  readOnly,
  playheadMs,
  onChangeEdge,
  onChangeClaim,
  onPlay,
  onRemove,
}: Props) {
  const claimValue = clip.claim_index === null ? AUTOMATIC_CLAIM : String(clip.claim_index);
  const claimOptions = [
    { value: AUTOMATIC_CLAIM, label: 'Closest claim (automatic)' },
    ...claims.map(claim => ({ value: String(claim.index), label: truncate(claim.text, 90) })),
  ];

  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-b border-divider p-3 last:border-b-0">
      <div
        className={cx(
          'grid h-7 w-7 place-items-center rounded-full text-[14px] font-semibold text-white',
          speakerSlot ? SPEAKER_FILL_CLASS[speakerSlot] : 'bg-grey-03'
        )}
        aria-hidden
      >
        {index + 1}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Text variant="metadataMedium">{speakerName ?? 'No speaker'}</Text>
          <Text variant="metadata" color="grey-04" className="tabular-nums">
            · {formatSeconds(clip.end_ms - clip.start_ms)}
          </Text>
        </div>
        <p className="mt-1.5 text-[14px] leading-[18px] tracking-[-0.1px] text-grey-05">
          {quote || <span className="text-grey-04">No whole words in this range.</span>}
        </p>
        {problems.length > 0 ? (
          <ul className={cx('mt-2 flex flex-col gap-0.5 text-[14px] leading-[18px]', NEGATIVE_TEXT_CLASS)}>
            {problems.map(problem => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2">
          {(['start', 'end'] as const).map(edge => (
            <EdgeControl
              key={edge}
              label={edge === 'start' ? 'Start' : 'End'}
              ms={edge === 'start' ? clip.start_ms : clip.end_ms}
              disabled={readOnly}
              canStep={words.length > 0}
              playheadMs={playheadMs}
              onStep={direction =>
                onChangeEdge(edge, stepEdge(edge === 'start' ? clip.start_ms : clip.end_ms, words, edge, direction))
              }
              onSet={(ms, snap) => onChangeEdge(edge, ms, { snap })}
            />
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <SmallButton onClick={onPlay}>Play from start</SmallButton>
          <SmallButton onClick={onRemove} disabled={readOnly}>
            Remove
          </SmallButton>
          <Text as="span" variant="metadata" color="grey-04" className="ml-1">
            Claim
          </Text>
          <div className="min-w-[220px] flex-1">
            <Select
              value={claimValue}
              disabled={readOnly}
              onChange={value => onChangeClaim(value === AUTOMATIC_CLAIM ? null : Number(value))}
              options={claimOptions}
              className="!py-1 text-[14px]"
            />
          </div>
        </div>
        {clip.claim_index === null && clip.live_claim_text ? (
          <Text as="p" variant="footnote" color="grey-04" className="mt-1.5">
            Live now for “{truncate(clip.live_claim_text, 120)}”
          </Text>
        ) : null}
      </div>
    </li>
  );
}

function EdgeControl({
  label,
  ms,
  disabled,
  canStep,
  playheadMs,
  onStep,
  onSet,
}: {
  label: string;
  ms: number;
  disabled: boolean;
  canStep: boolean;
  playheadMs: number | null;
  onStep: (direction: -1 | 1) => void;
  onSet: (ms: number, snap: boolean) => void;
}) {
  const formatted = formatReelTime(ms);
  const [draft, setDraft] = React.useState(formatted);
  const [invalid, setInvalid] = React.useState(false);
  // A change from anywhere else (a step, the playhead, a reload) replaces what was typed.
  React.useEffect(() => {
    setDraft(formatted);
    setInvalid(false);
  }, [formatted]);

  const commit = () => {
    if (draft === formatted) return;
    const parsed = parseReelTime(draft);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSet(parsed, true);
  };

  return (
    <div className="flex items-center gap-1">
      <Text as="span" variant="metadata" color="grey-04" className="w-9">
        {label}
      </Text>
      <SmallButton aria-label={`${label}: one word earlier`} disabled={disabled || !canStep} onClick={() => onStep(-1)}>
        ‹ word
      </SmallButton>
      <input
        aria-label={`${label} time`}
        aria-invalid={invalid || undefined}
        value={draft}
        disabled={disabled}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(formatted);
        }}
        className={cx(
          'h-6 w-[72px] rounded border bg-white px-1.5 text-center font-mono text-[13px] tabular-nums focus:border-text focus:outline-hidden',
          invalid ? 'border-red-01' : 'border-grey-02'
        )}
      />
      <SmallButton aria-label={`${label}: one word later`} disabled={disabled || !canStep} onClick={() => onStep(1)}>
        word ›
      </SmallButton>
      <SmallButton
        disabled={disabled || playheadMs === null}
        onClick={() => playheadMs !== null && onSet(playheadMs, true)}
      >
        Playhead
      </SmallButton>
    </div>
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
