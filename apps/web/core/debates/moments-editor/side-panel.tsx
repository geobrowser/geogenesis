'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ParticipantSlot } from '../api';
import type { EditorPanel } from './editor-state';
import {
  ClipChip,
  CloseIcon,
  ICON_BUTTON_CLASS,
  PILL_CLASS,
  PILL_COMPACT_CLASS,
  PlayIcon,
  SearchIcon,
  WarnIcon,
} from './editor-ui';
import { type EditorClip, type ReelSentence, formatReelTime } from './reel';
import type { ReelWarning, ReelWarningFix } from './reel-warnings';
import { SPEAKER_FILL_CLASS } from './speaker-classes';

/** The side panel's name for each mode, as the aside is labelled. */
export const PANEL_LABEL: Record<EditorPanel, string> = {
  transcript: 'Transcript',
  claim: 'Clip claim',
  replace: 'Clip picker',
  add: 'Clip picker',
  check: 'Check before publishing',
  warnings: 'All warnings',
};

/**
 * The side panel (GEO-3773): the transcript by default, or one job (a clip's claim, replacing or
 * adding a clip, the check's report, every warning) with ✕ back to the transcript.
 */
export function SidePanel({ panel, children }: { panel: EditorPanel; children: React.ReactNode }) {
  return (
    <aside
      aria-label={PANEL_LABEL[panel]}
      className="relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-grey-02 bg-white shadow-panel"
    >
      {children}
    </aside>
  );
}

export function PanelHead({
  title,
  chip,
  extra,
  onClose,
}: {
  title: string;
  chip?: React.ReactNode;
  extra?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-none flex-col gap-2.5 border-b border-divider px-4 pt-3.5 pb-3">
      <div className="flex items-center gap-2">
        {chip}
        <span className="flex-1 text-smallTitle">{title}</span>
        <button type="button" aria-label="Back to the transcript" className={ICON_BUTTON_CLASS} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      {extra}
    </div>
  );
}

export function PanelScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('relative min-h-0 flex-1 overflow-auto', className)}>{children}</div>;
}

/**
 * Replace or Add: the debate's sentences to pick a clip from, searchable, or the playhead. A pick
 * makes a clip of the replaced clip's length (or a new clip's), one speaker's words in one stretch,
 * clear of the other clips.
 */
export function ClipPicker({
  mode,
  number,
  sentences,
  clips,
  speakers,
  target,
  nameOf,
  focusMs,
  canUsePlayhead,
  onUse,
  onUsePlayhead,
  onPlayFrom,
  onClose,
}: {
  mode: 'replace' | 'add';
  /** The clip's number: the one replaced, or the one to add. */
  number: number;
  sentences: readonly ReelSentence[];
  clips: readonly EditorClip[];
  speakers: readonly (ParticipantSlot | null)[];
  /** The clip being replaced. */
  target: { index: number; speaker: ParticipantSlot | null; start_ms: number } | null;
  nameOf: (slot: ParticipantSlot | null) => string | null;
  /** Where the list opens: the replaced clip's start, or the playhead for a new clip. */
  focusMs: number | null;
  canUsePlayhead: boolean;
  onUse: (sentence: ReelSentence) => void;
  onUsePlayhead: () => void;
  onPlayFrom: (ms: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const focusIndex = focusMs === null ? -1 : sentences.findIndex(sentence => sentence.end_ms >= focusMs - 25_000);
  // Opens on the clip being replaced, or around the playhead (the prototype's pickerRows).
  React.useEffect(() => {
    const row = scrollRef.current?.querySelector<HTMLElement>('[data-focusrow]');
    if (row && scrollRef.current) scrollRef.current.scrollTop = Math.max(0, row.offsetTop - 120);
  }, []);
  const needle = query.trim().toLowerCase();
  return (
    <>
      <PanelHead
        title={mode === 'add' ? `Add clip ${number}` : `Replace clip ${number}`}
        onClose={onClose}
        extra={
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon />
              <input
                type="search"
                autoComplete="off"
                aria-label="Search the transcript"
                placeholder="Search the transcript"
                value={query}
                onChange={event => setQuery(event.target.value)}
                className="w-full appearance-none rounded border-0 bg-white py-[9px] pr-2.5 pl-9 text-input shadow-inner-grey-02 outline-none placeholder:text-grey-03 hover:shadow-inner-text focus:shadow-inner-lg-text"
              />
            </div>
            <button type="button" className={PILL_CLASS} disabled={!canUsePlayhead} onClick={onUsePlayhead}>
              Use playhead
            </button>
          </div>
        }
      />
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <ol className="m-0 flex list-none flex-col gap-0.5 p-2">
          {sentences.map((sentence, index) => {
            if (needle && !sentence.text.toLowerCase().includes(needle)) return null;
            const inClip = clips.findIndex(
              clip => sentence.end_ms > clip.start_ms + 50 && sentence.start_ms < clip.end_ms - 50
            );
            const cross = target !== null && target.speaker !== null && sentence.slot !== target.speaker;
            return (
              <li
                key={`${sentence.start_ms}-${index}`}
                data-focusrow={index === focusIndex ? '' : undefined}
                className={cx(
                  'group grid grid-cols-[34px_minmax(0,1fr)] gap-2 rounded px-2 py-1.5 focus-within:shadow-inner-grey-02 hover:shadow-inner-grey-02',
                  target !== null && inClip === target.index && 'bg-grey-01'
                )}
              >
                <span className="text-[14px] leading-[18px] text-grey-04 tabular-nums">
                  {formatReelTime(sentence.start_ms).replace(/\.\d$/, '')}
                </span>
                <span className="flex flex-col gap-1.5">
                  <span className="text-[14px] leading-[18px] tracking-[-0.1px]">
                    <i
                      aria-hidden
                      className={cx(
                        'mr-1.5 inline-block h-[7px] w-[7px] rounded-full align-[1px]',
                        SPEAKER_FILL_CLASS[sentence.slot]
                      )}
                    />
                    {sentence.text}
                    {inClip >= 0 ? (
                      <ClipChip
                        number={inClip + 1}
                        speaker={speakers[inClip] ?? null}
                        small
                        className="ml-1.5 align-[1px]"
                      />
                    ) : null}
                  </span>
                  <span className="hidden items-center gap-1.5 group-focus-within:flex group-hover:flex">
                    <button
                      type="button"
                      className={cx(PILL_CLASS, PILL_COMPACT_CLASS)}
                      onClick={() => onUse(sentence)}
                    >
                      Use this
                    </button>
                    <button
                      type="button"
                      aria-label={`Play from ${formatReelTime(sentence.start_ms).replace(/\.\d$/, '')}`}
                      onClick={() => onPlayFrom(sentence.start_ms)}
                      className={cx(ICON_BUTTON_CLASS, '!h-[26px] !w-[26px] border border-grey-02')}
                    >
                      <PlayIcon size={10} />
                    </button>
                  </span>
                  {cross ? (
                    <span className="hidden text-[14px] leading-[18px] text-grey-04 group-focus-within:block group-hover:block">
                      Becomes {nameOf(sentence.slot) ?? 'the other debater'}’s clip. Its claim goes back to automatic.
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

/** Every warning, numbered by its clip, each with its fix where it has one. */
export function WarningsList({
  warnings,
  speakers,
  readOnly,
  canAddAtPlayhead,
  onFix,
  onClose,
}: {
  warnings: readonly ReelWarning[];
  speakers: readonly (ParticipantSlot | null)[];
  readOnly: boolean;
  canAddAtPlayhead: boolean;
  onFix: (fix: ReelWarningFix) => void;
  onClose: () => void;
}) {
  return (
    <>
      <PanelHead title="All warnings" onClose={onClose} />
      <PanelScroll>
        <div className="px-4 pt-3 pb-4">
          {warnings.length === 0 ? (
            <p className="m-0 text-metadata text-grey-04">No warnings.</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {warnings.map(warning => (
                <li
                  key={warning.id}
                  className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5 border-divider [&+&]:border-t [&+&]:pt-3"
                >
                  {warning.clip !== undefined ? (
                    <ClipChip number={warning.clip + 1} speaker={speakers[warning.clip] ?? null} />
                  ) : (
                    <WarnIcon className="text-grey-04" />
                  )}
                  <span className="flex flex-col items-start gap-1.5 text-[14px] leading-[18px]">
                    <span>{warningText(warning)}</span>
                    {warning.fix ? (
                      <button
                        type="button"
                        className={cx(PILL_CLASS, PILL_COMPACT_CLASS)}
                        disabled={readOnly || (warning.fix.kind === 'add-at-playhead' && !canAddAtPlayhead)}
                        onClick={() => warning.fix && onFix(warning.fix)}
                      >
                        {warning.fix.label}
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </PanelScroll>
    </>
  );
}

/** A warning as one line: its title, then what to do. */
export function warningText(warning: Pick<ReelWarning, 'title' | 'recommendation'>) {
  const title = /[.?!]$/.test(warning.title) ? warning.title : `${warning.title}.`;
  return `${title} ${warning.recommendation}`;
}
