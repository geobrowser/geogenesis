'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { Tooltip } from '~/design-system/tooltip';

import type { ParticipantSlot } from '../api';
import {
  BarSeparator,
  ChevronDown,
  ClipChip,
  PILL_CLASS,
  PILL_COMPACT_CLASS,
  PILL_ON_CLASS,
  PlayIcon,
  SegmentButton,
  SegmentGroup,
  SnapSwitch,
  WarnIcon,
} from './editor-ui';
import { formatReelTime, parseReelTime } from './reel';
import { PADS, type Pad } from './reel-waveform';

/** A time to the tenth, as the panel's edges read: 0:41.9. */
export const formatTenths = formatReelTime;

/**
 * The bottom panel for the selected clip (GEO-3773): a bar of what can be done with it (play it,
 * replace or remove it, its advanced options, how far to zoom, back to the full debate), then its
 * start and end with word steppers either side of the zoomed waveform (`waveform`).
 */
export function ClipPanel({
  number,
  speaker,
  name,
  lengthMs,
  startMs,
  endMs,
  warning,
  editable,
  locked,
  replaceOpen,
  advancedOpen,
  snap,
  pad,
  canMoveEarlier,
  canMoveLater,
  canStep,
  waveform,
  onPlay,
  onReplace,
  onRemove,
  onAdvanced,
  onSetEdge,
  onSnap,
  onMove,
  onPad,
  onFullDebate,
  onStep,
}: {
  number: number;
  speaker: ParticipantSlot | null;
  name: string;
  lengthMs: number;
  startMs: number;
  endMs: number;
  /** The clip's first warning and its fix (decision D3). */
  warning: { text: string; fix: { label: string; disabled: boolean; onFix: () => void } | null } | null;
  /** Nothing is read-only or in flight, and the reel isn't playing. */
  editable: boolean;
  /** Read-only or a request in flight: Advanced has nothing to offer (its popover can't open). */
  locked: boolean;
  replaceOpen: boolean;
  advancedOpen: boolean;
  snap: boolean;
  pad: Pad;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  canStep: boolean;
  waveform: React.ReactNode;
  onPlay: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onAdvanced: (open: boolean) => void;
  /** A typed time: snapped to a word when `snap`. */
  onSetEdge: (edge: 'start' | 'end', ms: number) => void;
  onSnap: () => void;
  onMove: (direction: -1 | 1) => void;
  onPad: (pad: Pad) => void;
  onFullDebate: () => void;
  onStep: (edge: 'start' | 'end', direction: -1 | 1) => void;
}) {
  const compact = cx(PILL_CLASS, PILL_COMPACT_CLASS);
  const edgeColumn = (edge: 'start' | 'end') => (
    <div
      className={cx(
        'flex flex-col justify-center gap-1.5',
        edge === 'end' && 'items-end',
        !editable && 'pointer-events-none opacity-50'
      )}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="text-metadata text-grey-04">{edge === 'start' ? 'Start' : 'End'}</span>
        <span className="text-metadataMedium tabular-nums">{formatTenths(edge === 'start' ? startMs : endMs)}</span>
      </span>
      <SegmentGroup>
        {([-1, 1] as const).map(direction => (
          <SegmentButton
            key={direction}
            disabled={!editable || !canStep}
            aria-label={`${edge === 'start' ? 'Start' : 'End'} one word ${direction < 0 ? 'earlier' : 'later'}`}
            onClick={() => onStep(edge, direction)}
          >
            {direction < 0 ? '‹ word' : 'word ›'}
          </SegmentButton>
        ))}
      </SegmentGroup>
    </div>
  );
  return (
    <section
      aria-label={`Clip ${number}, ${name}`}
      className="relative flex flex-none flex-col rounded-lg border border-grey-02 bg-white"
    >
      {/* The bar wraps rather than overflowing: what the clip is on the left, what to do with it on
          the right, and when the two don't fit one row (the editor beside the app's sidebar, ~650 px),
          the actions take a second row, wrapping again if they must. Nothing is squeezed to nothing:
          the name and the warning end in an ellipsis (the warning's tooltip has it whole). */}
      <div
        data-testid="clip-bar"
        className="flex min-h-10 min-w-0 flex-none flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-divider py-1.5 pr-2 pl-3"
      >
        <span data-clip-bar-about className="flex min-w-0 flex-auto items-center gap-2">
          <ClipChip number={number} speaker={speaker} />
          <span className="min-w-[3rem] truncate text-metadataMedium">{name}</span>
          <span className="flex-none text-breadcrumb font-normal whitespace-nowrap text-grey-04 tabular-nums">
            {Math.round(lengthMs / 1000)} s
          </span>
          {warning ? (
            <span className="ml-1 flex min-w-0 items-center gap-1.5">
              <WarnIcon size={14} label="Warning" className="text-grey-04" />
              <Tooltip
                variant="light"
                label={warning.text}
                trigger={
                  <span
                    tabIndex={0}
                    data-clip-bar-warning
                    className="min-w-[4rem] truncate text-breadcrumb font-normal"
                  >
                    {warning.text}
                  </span>
                }
              />
              {warning.fix ? (
                <button
                  type="button"
                  className={cx(compact, 'flex-none')}
                  disabled={warning.fix.disabled}
                  onClick={warning.fix.onFix}
                >
                  {warning.fix.label}
                </button>
              ) : null}
            </span>
          ) : null}
        </span>
        <span
          data-clip-bar-actions
          className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-1.5"
        >
          <span className="inline-flex flex-none items-center gap-1.5">
            <button type="button" className={compact} onClick={onPlay}>
              <PlayIcon size={9} />
              Play clip
            </button>
            <button
              type="button"
              className={cx(compact, replaceOpen && PILL_ON_CLASS)}
              aria-expanded={replaceOpen}
              disabled={!editable}
              onClick={onReplace}
            >
              Replace
            </button>
            <button type="button" className={compact} disabled={!editable} onClick={onRemove}>
              Remove
            </button>
          </span>
          <BarSeparator />
          <Popover.Root open={advancedOpen} onOpenChange={onAdvanced}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className={cx(compact, advancedOpen && PILL_ON_CLASS)}
                aria-haspopup="dialog"
                disabled={locked}
              >
                Advanced
                <ChevronDown />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                aria-label="Advanced"
                side="top"
                align="end"
                sideOffset={8}
                collisionPadding={16}
                className="z-100 flex w-[300px] flex-col gap-2.5 rounded-lg border border-grey-02 bg-white p-3 shadow-lg"
              >
                <div className="grid grid-cols-2 gap-2">
                  <TimeField label="Start" ms={startMs} disabled={!editable} onSet={ms => onSetEdge('start', ms)} />
                  <TimeField label="End" ms={endMs} disabled={!editable} onSet={ms => onSetEdge('end', ms)} />
                </div>
                <div className="flex items-center justify-between">
                  <span aria-hidden className="text-metadata">
                    Snap to words
                  </span>
                  <SnapSwitch checked={snap} onChange={onSnap} />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={PILL_CLASS}
                    disabled={!editable || !canMoveEarlier}
                    onClick={() => onMove(-1)}
                  >
                    Move earlier
                  </button>
                  <button
                    type="button"
                    className={PILL_CLASS}
                    disabled={!editable || !canMoveLater}
                    onClick={() => onMove(1)}
                  >
                    Move later
                  </button>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <BarSeparator />
          <SegmentGroup label="Zoom around the clip">
            {PADS.map(level => (
              <SegmentButton key={level} pressed={pad === level} onClick={() => onPad(level)}>
                ±{level / 1000} s
              </SegmentButton>
            ))}
          </SegmentGroup>
          <BarSeparator />
          <button type="button" className={compact} onClick={onFullDebate}>
            Full debate
          </button>
        </span>
      </div>
      {/* Narrow (stacked) windows: Start and End share a row over the waveform, as the prototype's. */}
      <div className="grid min-h-0 flex-1 grid-cols-[112px_minmax(0,1fr)_112px] gap-4 px-3 py-2 max-[899px]:grid-cols-2 max-[899px]:gap-y-2">
        {edgeColumn('start')}
        <div className="min-w-0 max-[899px]:col-span-2 max-[899px]:row-start-2">{waveform}</div>
        {edgeColumn('end')}
      </div>
    </section>
  );
}

/** A typed edge: committed on Enter or leaving the field; an unreadable time goes back. */
function TimeField({
  label,
  ms,
  disabled,
  onSet,
}: {
  label: 'Start' | 'End';
  ms: number;
  disabled: boolean;
  onSet: (ms: number) => void;
}) {
  const formatted = formatTenths(ms);
  const [draft, setDraft] = React.useState(formatted);
  const [invalid, setInvalid] = React.useState(false);
  // A change from anywhere else (a step, a drag, a fix) replaces what was typed.
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
    setDraft(formatted);
    onSet(parsed);
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-metadata text-grey-04">{label}</span>
      <input
        aria-label={`${label} time`}
        aria-invalid={invalid || undefined}
        value={draft}
        disabled={disabled}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
        className={cx(
          'w-full appearance-none rounded border-0 bg-white px-2.5 py-[9px] text-input tabular-nums outline-none hover:shadow-inner-text focus:shadow-inner-lg-text',
          invalid ? 'shadow-inner-lg-ctaHover' : 'shadow-inner-grey-02'
        )}
      />
    </label>
  );
}
