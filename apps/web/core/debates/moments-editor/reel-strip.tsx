'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { Tooltip } from '~/design-system/tooltip';

import type { ParticipantSlot } from '../api';
import {
  ChevronDown,
  ClipChip,
  LinkIcon,
  MENU_ITEM_CLASS,
  PlayIcon,
  SMALL_TAG_CLASS,
  StopIcon,
  WarnIcon,
} from './editor-ui';
import { MANUAL_MAX_CLIPS, formatReelTime } from './reel';
import { REEL_CLIPS } from './reel-warnings';
import { type ClaimOption, SPEAKER_INK_BG_CLASS } from './speaker-classes';
import type { PlaySegment } from './use-play-range';

/** On the affordance that adds a 5th or 6th clip (GEO-3773, D4): reels aim for 4. */
export const EXTRA_CLIP_TOOLTIP = 'Reels work best with 4 clips. Add more only when the debate needs it.';

export type ClipCardView = {
  key: string;
  speaker: ParticipantSlot | null;
  name: string;
  quote: string;
  lengthMs: number;
  /** Changed since the reel that is live. */
  edited: boolean;
  /** The clip's first warning, if any (decision D3). */
  warning: string | null;
  /** It can't be published as it is (a problem found here or reported by the worker). */
  bad: boolean;
  claimText: string;
  claimTag: 'Live now' | 'Picked' | null;
  /** The claim the clip is linked to, or `null` for the closest (automatic): marked in its menu. */
  claimIndex: number | null;
};

export type ClaimChoice = ClaimOption & { live: boolean };

/** Whole seconds, as the cards show a clip's length. */
const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;
/** Rounded to the second, as the Play reel card shows the reel's length. */
const roundTime = (ms: number) => formatReelTime(Math.round(ms / 1000) * 1000).replace(/\.\d$/, '');

/**
 * The reel in play order (GEO-3773): Play reel, a card per clip, and the way to add one under the
 * clip cap (decision D4). The selected card swaps its quote for the clip's claim.
 */
export function ReelStrip({
  clips,
  selectedKey,
  reel,
  totalMs,
  over70Tip,
  clipCountWarning,
  readOnly,
  addOpen,
  canAdd,
  claimMenuOpen,
  claimChoices,
  claimDisabled,
  subscribe,
  canPlay,
  onPlayReel,
  onSelect,
  onClaim,
  onClaimMenu,
  onPickClaim,
  onAdd,
}: {
  clips: readonly ClipCardView[];
  /** The selected clip as shown; none while the reel plays. */
  selectedKey: string | null;
  /** While the reel plays: its segments and the one playing. */
  reel: { segments: readonly PlaySegment[]; key: string } | null;
  /** The reel's length: the clips' spans (the 70 s warning's basis). */
  totalMs: number;
  /** Set when the reel runs over 70 s. */
  over70Tip: string | null;
  /** The reel has 5 or 6 clips (D4): said on the Play reel card. */
  clipCountWarning: string | null;
  readOnly: boolean;
  /** The Add picker is open (nothing selected while a clip is picked to add). */
  addOpen: boolean;
  canAdd: boolean;
  claimMenuOpen: boolean;
  claimChoices: readonly ClaimChoice[];
  claimDisabled: boolean;
  subscribe: (listener: (positionMs: number) => void) => () => void;
  /** The player can play a reel (not on the combined-video fallback, which has no transport). */
  canPlay: boolean;
  onPlayReel: () => void;
  onSelect: (key: string) => void;
  /** The selected clip's claim button: a menu, or the claim panel for a clip that can't publish. */
  onClaim: () => void;
  onClaimMenu: (open: boolean) => void;
  onPickClaim: (claimIndex: number | null) => void;
  onAdd: () => void;
}) {
  const playing = reel !== null;
  const empty = clips.length === 0;
  const rootRef = React.useRef<HTMLElement>(null);

  // Progress and elapsed time move with the playhead, written straight into the cards.
  React.useEffect(() => {
    if (!reel) return;
    const at = reel.segments.findIndex(segment => segment.key === reel.key);
    return subscribe(positionMs => {
      const root = rootRef.current;
      if (!root || at < 0) return;
      let elapsed = 0;
      reel.segments.forEach((segment, index) => {
        const length = segment.end_ms - segment.start_ms;
        const done = index < at ? 1 : index > at ? 0 : clamp01((positionMs - segment.start_ms) / length);
        elapsed += done * length;
        const bar = root.querySelector<HTMLElement>(`[data-progress="${segment.key}"]`);
        if (bar) bar.style.width = `${done * 100}%`;
      });
      const out = root.querySelector<HTMLElement>('[data-reel-elapsed]');
      if (out) out.textContent = roundTime(elapsed);
    });
  }, [reel, subscribe]);
  // Once the reel stops, the bars go back to empty: React draws them at 0 on every render, so it
  // never puts back a width written above.
  React.useEffect(() => {
    if (playing) return;
    rootRef.current?.querySelectorAll<HTMLElement>('[data-progress]').forEach(bar => {
      bar.style.width = '0%';
    });
  }, [playing]);

  const addTile = !playing && !readOnly ? addAffordance(clips.length) : null;
  const columns = Math.max(REEL_CLIPS, clips.length + (addTile === 'card' ? 1 : 0));
  const placeholders = addTile === 'card' ? Math.max(0, REEL_CLIPS - clips.length - 1) : 0;
  const warning = over70Tip ? 'over 70 s' : clipCountWarning ? `${clips.length} clips` : null;

  return (
    <section
      ref={rootRef}
      aria-label="Reel"
      className="relative grid h-[84px] flex-none gap-3"
      style={{
        gridTemplateColumns: `160px repeat(${columns}, minmax(0, 1fr))${addTile === 'tile' ? ' 112px' : ''}`,
      }}
    >
      <button
        type="button"
        aria-keyshortcuts="Space"
        disabled={empty || !canPlay}
        onClick={onPlayReel}
        className="relative flex min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-lg border border-grey-01 bg-grey-01 px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:cursor-default disabled:opacity-50"
      >
        <span className="flex w-full items-center justify-between">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-text text-white">
            {playing ? <StopIcon /> : <PlayIcon size={10} nudge />}
          </span>
          {warning && !playing ? (
            <Tooltip
              variant="light"
              label={over70Tip ?? clipCountWarning}
              trigger={
                <span className="inline-flex items-center gap-1 text-breadcrumb text-grey-04 tabular-nums">
                  <WarnIcon size={13} label="Warning" />
                  {warning}
                </span>
              }
            />
          ) : (
            <span className="text-breadcrumb text-grey-04 tabular-nums">
              {empty ? `0 of ${REEL_CLIPS}` : `${clips.length} ${clips.length === 1 ? 'clip' : 'clips'}`}
            </span>
          )}
        </span>
        <span className="flex w-full items-baseline justify-between gap-2">
          <span className="text-button">{playing ? 'Stop' : 'Play reel'}</span>
          <span className="text-metadataMedium tabular-nums">
            {empty ? (
              '0:00'
            ) : playing ? (
              <>
                <span data-reel-elapsed>0:00</span> / {roundTime(totalMs)}
              </>
            ) : (
              roundTime(totalMs)
            )}
          </span>
        </span>
      </button>

      {clips.map((clip, index) => {
        const selected = !playing && clip.key === selectedKey;
        const isPlaying = playing && reel?.key === clip.key;
        const top = (
          <span className="flex w-full items-center gap-1.5">
            <ClipChip number={index + 1} speaker={clip.speaker} />
            <span className="truncate text-metadataMedium">{clip.name}</span>
            {clip.edited ? <span className={SMALL_TAG_CLASS}>Edited</span> : null}
            <span className="flex-1" />
            {clip.warning && !readOnly ? <WarnIcon size={14} label="1 warning" className="text-grey-04" /> : null}
            {clip.bad ? <WarnIcon size={14} label="Can’t publish" className="text-red-01" /> : null}
            <span className="text-breadcrumb text-grey-04 tabular-nums">{seconds(clip.lengthMs)}</span>
          </span>
        );
        const progress = (
          <span
            aria-hidden
            data-progress={clip.key}
            className={cx(
              'absolute bottom-0 left-0 h-[3px]',
              clip.speaker ? SPEAKER_INK_BG_CLASS[clip.speaker] : 'bg-grey-04'
            )}
            style={{ width: 0 }}
          />
        );
        const cardClass = cx(
          'relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-[border-color,box-shadow]',
          clip.bad
            ? 'border-red-01 shadow-[0_0_0_1px_var(--color-red-01)]'
            : selected
              ? 'border-text shadow-[0_0_0_1px_var(--color-text)]'
              : 'border-grey-02',
          isPlaying ? 'bg-grey-01' : 'bg-white'
        );
        if (selected) {
          return (
            <div key={clip.key} role="group" aria-label={`Clip ${index + 1}, ${clip.name}`} className={cardClass}>
              {top}
              <ClaimButton
                clip={clip}
                open={claimMenuOpen}
                disabled={claimDisabled}
                choices={claimChoices}
                onClick={onClaim}
                onOpenChange={onClaimMenu}
                onPick={onPickClaim}
              />
              {progress}
            </div>
          );
        }
        return (
          <button
            key={clip.key}
            type="button"
            aria-pressed={false}
            aria-label={`Clip ${index + 1}, ${clip.name}${clip.warning && !readOnly ? ', 1 warning' : ''}${clip.bad ? ', can’t publish' : ''}`}
            onClick={() => onSelect(clip.key)}
            className={cx(
              cardClass,
              'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text'
            )}
          >
            {top}
            <span className="line-clamp-2 text-[14px] leading-[18px] tracking-[-0.1px] text-grey-05">{clip.quote}</span>
            {progress}
          </button>
        );
      })}

      {addTile === 'card' ? (
        <button
          type="button"
          aria-pressed={addOpen}
          disabled={!canAdd}
          onClick={onAdd}
          className={cx(
            'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-white text-text disabled:cursor-default disabled:opacity-50',
            addOpen ? 'border-text' : 'border-grey-03'
          )}
        >
          <svg width="14" height="14" viewBox="0 0 17 17" fill="none" aria-hidden>
            <path d="M8.5 0.5V16.5" stroke="currentColor" />
            <path d="M0.5 8.5L16.5 8.5" stroke="currentColor" />
          </svg>
          <span className="text-button">Add clip</span>
        </button>
      ) : null}
      {Array.from({ length: placeholders }, (_, at) => (
        <span key={`placeholder-${at}`} aria-hidden className="rounded-lg border border-dashed border-grey-02" />
      ))}
      {addTile === 'tile' ? (
        <Tooltip
          label={EXTRA_CLIP_TOOLTIP}
          trigger={
            // A disabled button takes no pointer events: the wrapper keeps the reason reachable.
            <span className="flex" tabIndex={canAdd ? undefined : 0}>
              <button
                type="button"
                aria-pressed={addOpen}
                disabled={!canAdd}
                onClick={onAdd}
                className={cx(
                  'flex w-full cursor-pointer items-center justify-center rounded-lg border border-dashed bg-white px-2 text-center text-breadcrumb font-medium text-text disabled:cursor-default disabled:opacity-50',
                  addOpen ? 'border-text' : 'border-grey-03'
                )}
              >
                Add a {clips.length + 1 === 5 ? '5th' : '6th'} clip
              </button>
            </span>
          }
        />
      ) : null}
    </section>
  );
}

/** The clip cap (D4): the Add clip card under 4 clips, a compact tile at 4 or 5, nothing at 6. */
export function addAffordance(count: number): 'card' | 'tile' | null {
  if (count >= MANUAL_MAX_CLIPS) return null;
  return count < REEL_CLIPS ? 'card' : 'tile';
}

function ClaimButton({
  clip,
  open,
  disabled,
  choices,
  onClick,
  onOpenChange,
  onPick,
}: {
  clip: ClipCardView;
  open: boolean;
  disabled: boolean;
  choices: readonly ClaimChoice[];
  onClick: () => void;
  onOpenChange: (open: boolean) => void;
  onPick: (claimIndex: number | null) => void;
}) {
  const button = (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`Claim: ${clip.claimText}`}
      disabled={disabled}
      onClick={event => {
        // A clip that can't publish opens the claim panel instead of the menu.
        if (clip.bad) {
          event.preventDefault();
          onClick();
        }
      }}
      className={cx(
        'grid h-[30px] w-full cursor-pointer grid-cols-[14px_minmax(0,1fr)_auto_8px] items-center gap-1.5 rounded border-0 bg-white px-2 text-left text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:cursor-default disabled:opacity-60',
        clip.bad ? 'shadow-inner-lg-text' : 'shadow-inner-grey-02 hover:shadow-inner-text'
      )}
    >
      <LinkIcon />
      <span
        className={cx(
          'truncate text-[14px] leading-[18px] tracking-[-0.1px]',
          clip.claimTag === null ? 'text-grey-04' : 'text-text'
        )}
      >
        {clip.claimText}
      </span>
      {clip.claimTag ? <span className={SMALL_TAG_CLASS}>{clip.claimTag}</span> : <span />}
      <ChevronDown className="text-ctaPrimary" />
    </button>
  );
  if (clip.bad) return button;
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{button}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side="bottom"
          sideOffset={8}
          collisionPadding={16}
          className="z-100 w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-grey-02 bg-white py-1 shadow-lg"
        >
          <ClaimOptions name={clip.name} choices={choices} current={clip} onPick={onPick} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The claims a clip can be linked to: automatic, then its speaker's (the menu and the claim panel). */
export function ClaimOptions({
  name,
  choices,
  current,
  onPick,
}: {
  name: string;
  choices: readonly ClaimChoice[];
  current: { claimIndex: number | null };
  onPick: (claimIndex: number | null) => void;
}) {
  const selected = (index: number | null) => current.claimIndex === index;
  return (
    <div role="listbox" aria-label="Claim">
      <ClaimRow label="Closest claim (automatic)" on={selected(null)} bold onPick={() => onPick(null)} />
      {choices.length > 0 ? (
        <div className="px-3 pt-2 pb-1 text-breadcrumb font-medium text-grey-04">{name}’s claims</div>
      ) : null}
      {choices.map(choice => (
        <ClaimRow
          key={choice.index}
          label={choice.retained ? `${choice.text} (earlier extraction)` : choice.text}
          on={selected(choice.index)}
          live={choice.live}
          onPick={() => onPick(choice.index)}
        />
      ))}
    </div>
  );
}

function ClaimRow({
  label,
  on,
  live = false,
  bold = false,
  onPick,
}: {
  label: string;
  on: boolean;
  live?: boolean;
  bold?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      onClick={onPick}
      className={cx(MENU_ITEM_CLASS, on && 'before:!bg-grey-01')}
    >
      <span className={bold ? undefined : 'font-normal'}>{label}</span>
      {live ? <span className={SMALL_TAG_CLASS}>Live now</span> : null}
    </button>
  );
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
