'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { SmallButton } from '~/design-system/button';
import { Text } from '~/design-system/text';

import type { DebateMediaTurnSegment, DebateTranscriptResponse, ParticipantSlot } from '../api';
import { formatTimecode } from '../claim-timing';
import { transcriptOnRecordings } from '../recording-clock';
import { SPEAKER_EDGE_CLASS, SPEAKER_FILL_CLASS } from './clip-row';
import {
  type EditorClip,
  MIN_EDIT_CLIP_MS,
  type ReelWord,
  type SelectionClip,
  formatReelTime,
  formatSeconds,
  isSpoken,
  selectionToClip,
  wordInSpan,
} from './reel';

/** A sentence (or, from a transcript served without sentences, a line) on the player's clock. */
export type ReelSentence = { slot: ParticipantSlot; start_ms: number; end_ms: number; text: string };

/** A clip's words, underlined in its speaker's colour in the transcript. */
const SPEAKER_UNDERLINE_CLASS = { 1: 'decoration-purple', 2: 'decoration-pink' } as const;

/** How far a sentence must reach into a clip to count as in it, so a shared edge does not. */
const OVERLAP_MS = 150;

/** How long a keyboard selection rests before the toolbar reads it. */
export const SELECTION_SETTLE_MS = 200;

/**
 * The transcript's sentences on the player's clock, in time order: the served `sentences`
 * (GEO-3349), or its lines where it has none. A sentence the render cut is left out.
 */
export function reelSentences(transcript: DebateTranscriptResponse | undefined): ReelSentence[] {
  const sentences = transcript?.sentences?.length ? transcript.sentences : (transcript?.segments ?? []);
  return transcriptOnRecordings(sentences)
    .map(sentence => ({
      slot: sentence.participant_slot,
      start_ms: sentence.start_ms,
      end_ms: sentence.end_ms,
      text: sentence.text,
    }))
    .sort((a, b) => a.start_ms - b.start_ms);
}

export function sentenceInClip(sentence: ReelSentence, clip: Pick<EditorClip, 'start_ms' | 'end_ms'>) {
  return sentence.end_ms > clip.start_ms + OVERLAP_MS && sentence.start_ms < clip.end_ms - OVERLAP_MS;
}

/** The clip with its start moved to `sentence`'s start; its end follows if it would come first. */
export function startClipAt(clip: EditorClip, sentence: ReelSentence): EditorClip {
  const start = sentence.start_ms;
  return { ...clip, start_ms: start, end_ms: clip.end_ms <= start + MIN_EDIT_CLIP_MS ? sentence.end_ms : clip.end_ms };
}

/** The clip with its end moved to `sentence`'s end; its start follows if it would come after. */
export function endClipAt(clip: EditorClip, sentence: ReelSentence): EditorClip {
  const end = sentence.end_ms;
  return {
    ...clip,
    end_ms: end,
    start_ms: clip.start_ms >= end - MIN_EDIT_CLIP_MS ? sentence.start_ms : clip.start_ms,
  };
}

/**
 * Which words each sentence shows, as indexes into `words` (GEO-3766): a word belongs to its
 * speaker's sentence whose `[start, next sentence's start)` holds the word's start, the speaker's last
 * sentence taking the rest and the first anything before it. Every spoken word of a speaker with
 * sentences is shown exactly once, so what can be selected is what the clip plays; blank tokens,
 * neither shown nor heard, are left out.
 */
export function wordsBySentence(sentences: readonly ReelSentence[], words: readonly ReelWord[]): number[][] {
  const shown = sentences.map(() => [] as number[]);
  const bySlot = new Map<ParticipantSlot, number[]>();
  sentences.forEach((sentence, at) => bySlot.set(sentence.slot, [...(bySlot.get(sentence.slot) ?? []), at]));
  const cursor = new Map<ParticipantSlot, number>();
  words.forEach((word, index) => {
    const own = bySlot.get(word.slot);
    // A blank token shows nothing: a sentence holding only blanks falls back to its own text.
    if (!own || !isSpoken(word)) return;
    let at = cursor.get(word.slot) ?? 0;
    while (at + 1 < own.length && sentences[own[at + 1]].start_ms <= word.start_ms) at += 1;
    cursor.set(word.slot, at);
    shown[own[at]].push(index);
  });
  return shown;
}

/** Whether `range` covers any of `element`'s text, not just touches its edge. */
function coversText(range: Range, element: Element): boolean {
  const inside = element.ownerDocument.createRange();
  inside.selectNodeContents(element);
  if (range.compareBoundaryPoints(Range.START_TO_START, inside) > 0) {
    inside.setStart(range.startContainer, range.startOffset);
  }
  if (range.compareBoundaryPoints(Range.END_TO_END, inside) < 0) inside.setEnd(range.endContainer, range.endOffset);
  return !inside.collapsed && inside.toString().trim() !== '';
}

/**
 * The words a selection covers, as the first and last index into the editor's words, or `null`
 * when it covers none (GEO-3766). A word partly selected counts whole. An end that rests off a word
 * (a timecode, a clip's badge, the space between words) counts from the nearest word inside the
 * selection: the first after its start, the last before its end. `Range` is in document order
 * whichever way the selection was dragged.
 */
export function selectedWordRange(range: Range, root: Element): [number, number] | null {
  if (range.collapsed) return null;
  let first: number | null = null;
  let last: number | null = null;
  for (const element of root.querySelectorAll<HTMLElement>('[data-word]')) {
    if (!range.intersectsNode(element) || !coversText(range, element)) continue;
    const index = Number(element.dataset.word);
    first = first === null ? index : Math.min(first, index);
    last = last === null ? index : Math.max(last, index);
  }
  return first === null || last === null ? null : [first, last];
}

/**
 * Where the selection toolbar is pinned (GEO-3766): the selection's last line, where the pointer let
 * go, kept inside the transcript's box. Part of a selection can be scrolled out of that box, and the
 * toolbar belongs by the words still in view, not by the hidden ones.
 */
export function selectionAnchorRect(range: Range, root: Element): DOMRect {
  const lines = range.getClientRects();
  const end = lines.length > 0 ? lines[lines.length - 1] : range.getBoundingClientRect();
  const box = root.getBoundingClientRect();
  const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
  const left = clamp(end.left, box.left, box.right);
  const right = clamp(end.right, box.left, box.right);
  const top = clamp(end.top, box.top, box.bottom);
  const bottom = clamp(end.bottom, box.top, box.bottom);
  return new DOMRect(left, top, right - left, bottom - top);
}

/**
 * `range` with an end outside `root` pulled back to the outermost transcript word it covers
 * (GEO-3766), so the toolbar is pinned by those words, inside the transcript's scrolling box, not by
 * the element below or above it that a drag past the box's edge ended on.
 */
export function wordsOnly(range: Range, root: Element): Range {
  const words = [...root.querySelectorAll('[data-word]')].filter(
    element => range.intersectsNode(element) && coversText(range, element)
  );
  const kept = range.cloneRange();
  if (words.length === 0) return kept;
  if (!root.contains(kept.startContainer)) kept.setStartBefore(words[0]);
  if (!root.contains(kept.endContainer)) kept.setEndAfter(words[words.length - 1]);
  return kept;
}

/** The space Whisper puts before a word, outside its span, so it reads as text without selecting it. */
function wordGap(text: string, firstInSentence: boolean) {
  if (firstInSentence) return '';
  if (/^\s/.test(text)) return ' ';
  return /^[.,!?;:%)\]}'’”-]/.test(text) ? '' : ' ';
}

type WordPick = { from: number; to: number; range: Range };

/**
 * The debate's transcript, turn by turn (GEO-3672): which words each clip plays, and from any
 * sentence, start or end the selected clip there, start a new clip there, or play from it.
 * Highlighting words sets the selected clip to them or makes a new clip of them (GEO-3766).
 */
export function ReelTranscript({
  sentences,
  words,
  wordTiming,
  turns,
  clips,
  speakers,
  selected,
  readOnly,
  canAddClip,
  nameOf,
  onChangeClip,
  onAddClip,
  onSetClipWords,
  onAddClipWords,
  onSeek,
}: {
  sentences: readonly ReelSentence[];
  /** The editor's words (`playerWords`): what a selection's `data-word` indexes point into. */
  words: readonly ReelWord[];
  /** The transcript's `word_timing`: `false` when it has no word timings to select by. */
  wordTiming: boolean | undefined;
  turns: readonly DebateMediaTurnSegment[];
  clips: readonly EditorClip[];
  speakers: readonly (1 | 2 | null)[];
  selected: number;
  readOnly: boolean;
  /** Whether a clip can be added: the reel isn't read-only and has room. */
  canAddClip: boolean;
  nameOf: (slot: ParticipantSlot | null) => string | null;
  onChangeClip: (index: number, clip: EditorClip) => void;
  /** Adds a clip starting at `ms`, the editor's own way, and selects it. */
  onAddClip: (ms: number) => void;
  /** Sets clip `index` to exactly `span`, a selection's words. */
  onSetClipWords: (index: number, span: { start_ms: number; end_ms: number }) => void;
  /** Adds a clip of exactly `span`, a selection's words, and selects it. */
  onAddClipWords: (span: { start_ms: number; end_ms: number }) => void;
  onSeek: (ms: number) => void;
}) {
  const selectedClip = clips[selected];
  const turnsOfSentences: { sentence: ReelSentence; at: number }[][] = [];
  sentences.forEach((sentence, at) => {
    const last = turnsOfSentences.at(-1);
    if (last && last[0].sentence.slot === sentence.slot) last.push({ sentence, at });
    else turnsOfSentences.push([{ sentence, at }]);
  });

  const shownWords = React.useMemo(() => wordsBySentence(sentences, words), [sentences, words]);
  // Which clips play each word, as geo-chat counts a clip's words (`wordsIn`), and where each clip's
  // first word is, for its number.
  const wordClips = React.useMemo(
    () =>
      words.map(word =>
        isSpoken(word) ? clips.flatMap((clip, index) => (wordInSpan(word, clip) ? [index] : [])) : []
      ),
    [words, clips]
  );
  const firstWordOf = React.useMemo(() => {
    const first = new Map<number, number[]>();
    clips.forEach((clip, index) => {
      const at = words.findIndex(word => isSpoken(word) && wordInSpan(word, clip));
      if (at >= 0) first.set(at, [...(first.get(at) ?? []), index]);
    });
    return first;
  }, [words, clips]);

  const noWordTimings = sentences.length > 0 && (wordTiming === false || words.length === 0);
  const canPick = !noWordTimings && !readOnly && (selectedClip !== undefined || canAddClip);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const pointerDown = React.useRef(false);
  // While words are being selected, the sentences' buttons stay hidden, so the text doesn't move
  // under the pointer as it crosses sentences.
  const [selecting, setSelecting] = React.useState(false);
  const [pick, setPick] = React.useState<WordPick | null>(null);

  const activeRange = React.useCallback((): Range | null => {
    const selection = window.getSelection();
    const root = rootRef.current;
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !root) return null;
    // Only words picked in the transcript: a selection pressed elsewhere (a drag from the timeline)
    // or of the whole page (Cmd+A, anchored on `body`) is not one. Where it was pressed decides, not
    // where it ends: a drag past the box's edge autoscrolls the box and ends on whatever is under the
    // pointer outside it, though every word it covers is the transcript's.
    return selection.anchorNode && root.contains(selection.anchorNode) ? selection.getRangeAt(0) : null;
  }, []);
  const readPick = React.useCallback(() => {
    const range = activeRange();
    const root = rootRef.current;
    const covered = range && root ? selectedWordRange(range, root) : null;
    setPick(range && root && covered ? { from: covered[0], to: covered[1], range: wordsOnly(range, root) } : null);
  }, [activeRange]);

  React.useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onSelectionChange = () => {
      clearTimeout(settle);
      if (!activeRange()) {
        setPick(null);
        if (!pointerDown.current) setSelecting(false);
        return;
      }
      setSelecting(true);
      // A drag is read when it ends; a keyboard selection once it rests.
      if (!pointerDown.current) settle = setTimeout(readPick, SELECTION_SETTLE_MS);
    };
    // A press ends with `pointerup`, or, when the browser takes the gesture over (a drag of selected
    // text, a touch turned into a scroll), with `pointercancel` and `dragend` instead.
    const onPressEnd = () => {
      if (!pointerDown.current) return;
      pointerDown.current = false;
      readPick();
      if (!activeRange()) setSelecting(false);
    };
    const pressEnds = ['pointerup', 'pointercancel', 'dragend'] as const;
    document.addEventListener('selectionchange', onSelectionChange);
    for (const type of pressEnds) document.addEventListener(type, onPressEnd);
    return () => {
      clearTimeout(settle);
      document.removeEventListener('selectionchange', onSelectionChange);
      for (const type of pressEnds) document.removeEventListener(type, onPressEnd);
    };
  }, [activeRange, readPick]);

  const onPointerDown = (event: React.PointerEvent) => {
    // A sentence's buttons are clicked, not selected from: hiding them here would lose the click.
    if (event.button > 0 || (event.target as Element).closest('button')) return;
    pointerDown.current = true;
    setSelecting(true);
  };

  const result: SelectionClip | null = pick && canPick ? selectionToClip(words, pick.from, pick.to, turns) : null;
  const closePick = () => {
    window.getSelection()?.removeAllRanges();
    setPick(null);
    setSelecting(false);
  };
  // `contextElement` is inside the transcript's scrolling box, so the toolbar is repositioned when
  // that box scrolls, not only the window (floating-ui's `autoUpdate` listens on its scroll parents).
  // `pick.range` ends inside it: `wordsOnly` pulled an end outside the box back to the last word.
  const anchor = React.useMemo(() => {
    const end = pick?.range.endContainer;
    const contextElement = (end instanceof Element ? end : end?.parentElement) ?? rootRef.current ?? undefined;
    return {
      current: {
        getBoundingClientRect: () =>
          pick && rootRef.current ? selectionAnchorRect(pick.range, rootRef.current) : new DOMRect(),
        contextElement,
      },
    };
  }, [pick]);

  return (
    <section className="rounded border border-grey-02 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-divider p-3">
        <Text as="h2" variant="smallTitle">
          Transcript
        </Text>
        {selectedClip ? (
          <Text as="span" variant="metadata" color="grey-04">
            Clip {selected + 1} selected
          </Text>
        ) : null}
      </div>
      {noWordTimings ? (
        <Text as="p" variant="metadata" color="grey-04" className="border-b border-divider px-3 py-2">
          This transcript has no word timings, so clips can&apos;t be made from a selection.
        </Text>
      ) : null}
      {sentences.length === 0 ? (
        <Text as="p" variant="metadata" color="grey-04" className="p-3">
          No transcript.
        </Text>
      ) : (
        <div
          ref={rootRef}
          data-testid="reel-transcript"
          data-selecting={selecting || undefined}
          className="max-h-[880px] overflow-auto"
          onPointerDown={onPointerDown}
        >
          {turnsOfSentences.map(turn => (
            <div key={turn[0].sentence.start_ms} className="border-b border-divider px-3 py-2.5 last:border-b-0">
              <div className="mb-1.5 flex items-center gap-1.5 text-[14px] font-medium select-none">
                <span aria-hidden className={cx('h-2 w-2 rounded-full', SPEAKER_FILL_CLASS[turn[0].sentence.slot])} />
                {nameOf(turn[0].sentence.slot)}
              </div>
              {turn.map(({ sentence, at }) => {
                const own = shownWords[at] ?? [];
                // With words, a sentence is in the clips that play any of them; without, by its times.
                const inClips =
                  own.length > 0
                    ? [...new Set(own.flatMap(index => wordClips[index]))].sort((a, b) => a - b)
                    : clips.flatMap((clip, index) => (sentenceInClip(sentence, clip) ? [index] : []));
                const firstSpeaker = inClips.length > 0 ? speakers[inClips[0]] : null;
                return (
                  <div
                    key={`${sentence.start_ms}-${sentence.end_ms}`}
                    className={cx(
                      'group grid grid-cols-[48px_minmax(0,1fr)] gap-2 rounded px-1.5 py-1 text-[14px] leading-[18px] tracking-[-0.1px] hover:bg-grey-01',
                      own.length === 0 && inClips.includes(selected) && 'bg-ctaTertiary',
                      firstSpeaker ? SPEAKER_EDGE_CLASS[firstSpeaker] : null
                    )}
                  >
                    <span className="pt-px font-mono text-[12px] text-grey-04 tabular-nums select-none">
                      {formatTimecode(sentence.start_ms)}
                    </span>
                    <div>
                      {own.length > 0 ? (
                        <SentenceWords
                          own={own}
                          words={words}
                          wordClips={wordClips}
                          firstWordOf={firstWordOf}
                          speakers={speakers}
                          selected={selected}
                          marks={own
                            .map(index => `${wordClips[index].join('.')}/${(firstWordOf.get(index) ?? []).join('.')}`)
                            .join(',')}
                          speakersKey={speakers.join(',')}
                        />
                      ) : (
                        <>
                          {sentence.text}
                          {inClips.map(index => (
                            <ClipBadge key={index} index={index} speaker={speakers[index]} />
                          ))}
                        </>
                      )}
                      <div
                        className={cx(
                          'mt-1 hidden flex-wrap gap-1 select-none',
                          !selecting && 'group-focus-within:flex group-hover:flex'
                        )}
                      >
                        {selectedClip && !readOnly ? (
                          <>
                            <SmallButton onClick={() => onChangeClip(selected, startClipAt(selectedClip, sentence))}>
                              Start clip {selected + 1} here
                            </SmallButton>
                            <SmallButton onClick={() => onChangeClip(selected, endClipAt(selectedClip, sentence))}>
                              End clip {selected + 1} here
                            </SmallButton>
                          </>
                        ) : null}
                        {canAddClip ? (
                          <SmallButton onClick={() => onAddClip(sentence.start_ms)}>New clip here</SmallButton>
                        ) : null}
                        <SmallButton
                          aria-label={`Play from ${formatReelTime(sentence.start_ms)}`}
                          onClick={() => onSeek(sentence.start_ms)}
                        >
                          ▶
                        </SmallButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <Popover.Root
        open={result !== null}
        onOpenChange={open => {
          if (!open) setPick(null);
        }}
      >
        <Popover.Anchor virtualRef={anchor} />
        {result ? (
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="start"
              sideOffset={6}
              collisionPadding={16}
              aria-label="Clip from the selected words"
              // Reading or clicking the toolbar must not take focus from, or clear, the selection.
              onOpenAutoFocus={event => event.preventDefault()}
              onMouseDown={event => event.preventDefault()}
              className="z-100 flex max-w-[360px] flex-col gap-2 rounded-lg border border-grey-02 bg-white p-2 shadow-lg"
            >
              <SelectionToolbar
                result={result}
                selected={selectedClip ? selected : null}
                canAddClip={canAddClip}
                nameOf={nameOf}
                onSet={span => {
                  onSetClipWords(selected, span);
                  closePick();
                }}
                onAdd={span => {
                  onAddClipWords(span);
                  closePick();
                }}
              />
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </Popover.Root>
    </section>
  );
}

/**
 * A sentence's words, each marked with the clips that play it. Kept from re-rendering while its
 * marks are unchanged (`marks`, `speakersKey`), so a drag on the timeline doesn't redraw every word
 * of a long debate on each frame.
 */
const SentenceWords = React.memo(
  function SentenceWords({
    own,
    words,
    wordClips,
    firstWordOf,
    speakers,
    selected,
  }: {
    own: readonly number[];
    words: readonly ReelWord[];
    wordClips: readonly (readonly number[])[];
    firstWordOf: ReadonlyMap<number, readonly number[]>;
    speakers: readonly (1 | 2 | null)[];
    selected: number;
    /** What this sentence's marks are: the props above it reads, as a string to compare. */
    marks: string;
    speakersKey: string;
  }) {
    return own.map((index, nth) => {
      const word = words[index];
      const body = word.text.trim();
      if (!body) return null;
      const playedBy = wordClips[index];
      const speaker = playedBy.length > 0 ? speakers[playedBy[0]] : null;
      return (
        <React.Fragment key={index}>
          {wordGap(word.text, nth === 0)}
          {(firstWordOf.get(index) ?? []).map(clipIndex => (
            <ClipBadge key={clipIndex} index={clipIndex} speaker={speakers[clipIndex]} before />
          ))}
          <span
            data-word={index}
            className={cx(
              playedBy.length > 0 && 'underline decoration-2 underline-offset-[3px]',
              playedBy.length > 0 && (speaker ? SPEAKER_UNDERLINE_CLASS[speaker] : 'decoration-grey-03'),
              playedBy.includes(selected) && 'bg-ctaTertiary'
            )}
          >
            {body}
          </span>
        </React.Fragment>
      );
    });
  },
  (before, after) =>
    before.own === after.own &&
    before.words === after.words &&
    before.selected === after.selected &&
    before.marks === after.marks &&
    before.speakersKey === after.speakersKey
);

function ClipBadge({ index, speaker, before }: { index: number; speaker: 1 | 2 | null; before?: boolean }) {
  return (
    <span
      className={cx(
        'rounded-sm px-[5px] py-px text-[11px] leading-[13px] font-medium text-white select-none',
        before ? 'mr-1' : 'ml-1.5',
        speaker ? SPEAKER_FILL_CLASS[speaker] : 'bg-grey-03'
      )}
    >
      {index + 1}
    </span>
  );
}

function SelectionToolbar({
  result,
  selected,
  canAddClip,
  nameOf,
  onSet,
  onAdd,
}: {
  result: SelectionClip;
  /** The selected clip's index, or `null` when no clip is selected. */
  selected: number | null;
  canAddClip: boolean;
  nameOf: (slot: ParticipantSlot | null) => string | null;
  onSet: (span: { start_ms: number; end_ms: number }) => void;
  onAdd: (span: { start_ms: number; end_ms: number }) => void;
}) {
  if (!result.ok) {
    return (
      <Text as="p" variant="metadata" color="grey-04">
        {result.reason === 'crosses-cut'
          ? 'These words cross a cut in the video. Pick words from one stretch.'
          : 'No words selected.'}
      </Text>
    );
  }
  const span = { start_ms: result.start_ms, end_ms: result.end_ms };
  const other = result.speaker === 1 ? 2 : 1;
  return (
    <>
      <Text as="p" variant="metadata" color="grey-04">
        {formatReelTime(result.start_ms)} to {formatReelTime(result.end_ms)},{' '}
        {formatSeconds(result.end_ms - result.start_ms)}
      </Text>
      {result.otherWords > 0 ? (
        <Text as="p" variant="metadata" color="grey-04">
          An exchange clip: it&apos;s {nameOf(result.speaker)}&apos;s, who says the most words, and also plays{' '}
          {result.otherWords} {result.otherWords === 1 ? 'word' : 'words'} of {nameOf(other)}&apos;s.
        </Text>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {selected !== null ? (
          <SmallButton onClick={() => onSet(span)}>Set clip {selected + 1} to these words</SmallButton>
        ) : null}
        {canAddClip ? <SmallButton onClick={() => onAdd(span)}>New clip from these words</SmallButton> : null}
      </div>
    </>
  );
}
