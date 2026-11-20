'use client';

import * as React from 'react';

import cx from 'classnames';

import { Tooltip } from '~/design-system/tooltip';

import type { DebateMediaTurnSegment, DebateTranscriptResponse, ParticipantSlot } from '../api';
import { formatTimecode } from '../claim-timing';
import { transcriptOnRecordings } from '../recording-clock';
import { transcriptSpans } from '../transcript-lines';
import { FREE_STEP_MS } from './clip-drag';
import { ClipChip, PILL_CLASS, PILL_COMPACT_CLASS, SearchIcon, WarnIcon } from './editor-ui';
import {
  type EditorClip,
  MANUAL_MAX_CLIPS,
  MIN_EDIT_CLIP_MS,
  type ReelSentence,
  type ReelWord,
  type SelectionClip,
  formatReelTime,
  isSpoken,
  selectionToClip,
  sentenceInClip,
  stepEdge,
  wordInSpan,
} from './reel';
import { EXTRA_CLIP_TOOLTIP } from './reel-strip';
import { SPEAKER_FILL_CLASS, SPEAKER_TEXT_CLASS } from './speaker-classes';

/** Who says what, as the transcript names the debaters. */
export type TranscriptNames = Record<1 | 2, string | null>;

/** How long a keyboard selection rests before the toolbar reads it. */
export const SELECTION_SETTLE_MS = 200;

/** A pause longer than this between one speaker's sentences starts a new turn (the prototype's 6 s). */
const TURN_GAP_MS = 6_000;

/** How much two clips may share at an edge before they overlap (the prototype's 0.02 s). */
const OVERLAP_SLACK_MS = 20;

/**
 * The transcript's sentences on the player's clock, in time order: the served `sentences`
 * (GEO-3349), or its lines where it has none. A sentence the render cut is left out, and so is a blank
 * one: geo-chat splits a turn around the other debater's blank tokens, and that blank sentence would
 * show as an empty row repeating its clip's badge.
 */
export function reelSentences(transcript: DebateTranscriptResponse | undefined): ReelSentence[] {
  return transcriptOnRecordings(transcriptSpans(transcript))
    .filter(isSpoken)
    .map(sentence => ({
      slot: sentence.participant_slot,
      start_ms: sentence.start_ms,
      end_ms: sentence.end_ms,
      text: sentence.text,
    }))
    .sort((a, b) => a.start_ms - b.start_ms);
}

/**
 * Which words each sentence shows, as indexes into `words` (GEO-3766): a word belongs to its
 * speaker's sentence whose `[start, next sentence's start)` holds the word's start, the speaker's last
 * sentence taking the rest and the first anything before it. Every word of a speaker with sentences
 * is shown exactly once, so what can be selected is what the clip plays. `words` are `playerWords`,
 * which already leaves blank tokens out.
 */
export function wordsBySentence(sentences: readonly ReelSentence[], words: readonly ReelWord[]): number[][] {
  const shown = sentences.map(() => [] as number[]);
  const bySlot = new Map<ParticipantSlot, number[]>();
  sentences.forEach((sentence, at) => {
    const own = bySlot.get(sentence.slot);
    if (own) own.push(at);
    else bySlot.set(sentence.slot, [at]);
  });
  const cursor = new Map<ParticipantSlot, number>();
  words.forEach((word, index) => {
    const own = bySlot.get(word.slot);
    // Neither list holds blank text: `playerWords` drops blank tokens and `reelSentences` drops the
    // blank sentences geo-chat serves between them (`isSpoken`).
    if (!own) return;
    let at = cursor.get(word.slot) ?? 0;
    while (at + 1 < own.length && sentences[own[at + 1]].start_ms <= word.start_ms) at += 1;
    cursor.set(word.slot, at);
    shown[own[at]].push(index);
  });
  return shown;
}

/** A sentence shown as its text: one with no word to show (a transcript without word timings). */
type TurnItem = { word: number } | { sentence: number };

/** One speaker's run of sentences, as the transcript shows it: a timecode, the speaker, the words. */
export type TranscriptTurn = { key: string; slot: ParticipantSlot; start_ms: number; items: TurnItem[] };

/**
 * The transcript's turns (the prototype's `trHtml`): a new turn where the speaker changes or after a
 * pause of more than 6 s. Each turn lists its sentences' words in order, or a sentence's text where it
 * has no words.
 */
export function transcriptTurns(
  sentences: readonly ReelSentence[],
  shownWords: readonly (readonly number[])[]
): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  let previous: ReelSentence | null = null;
  sentences.forEach((sentence, at) => {
    if (!previous || previous.slot !== sentence.slot || sentence.start_ms - previous.end_ms > TURN_GAP_MS) {
      turns.push({ key: `${sentence.start_ms}-${at}`, slot: sentence.slot, start_ms: sentence.start_ms, items: [] });
    }
    const own = shownWords[at] ?? [];
    const items = turns[turns.length - 1].items;
    if (own.length === 0) items.push({ sentence: at });
    else for (const word of own) items.push({ word });
    previous = sentence;
  });
  return turns;
}

/**
 * Where a search finds `query` (the prototype's `runSearch`): each hit is the first and last index
 * of the words it spans. Words are matched lower case, joined by single spaces, from the start of a
 * word; a query inside a single word matches too.
 */
export function searchHits(words: readonly ReelWord[], query: string): [number, number][] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const texts = words.map(word => word.text.trim().toLowerCase());
  const hits: [number, number][] = [];
  for (let at = 0; at < texts.length; at += 1) {
    let joined = '';
    let next = at;
    while (next < texts.length && joined.length < needle.length) {
      joined += (joined ? ' ' : '') + texts[next];
      next += 1;
    }
    if (joined.startsWith(needle) || (next === at + 1 && joined.includes(needle))) hits.push([at, next - 1]);
  }
  return hits;
}

/** The word being said at `ms`: the first that hasn't ended (the prototype's `firstWordIdx`). */
export function wordAt(words: readonly ReelWord[], ms: number): number {
  let low = 0;
  let high = words.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (words[middle].end_ms < ms) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** The first clip other than `skip` that `span` overlaps, or -1. */
export function overlappedClip(
  clips: readonly Pick<EditorClip, 'start_ms' | 'end_ms'>[],
  span: { start_ms: number; end_ms: number },
  skip = -1
): number {
  return clips.findIndex(
    (clip, at) =>
      at !== skip && span.start_ms < clip.end_ms - OVERLAP_SLACK_MS && span.end_ms > clip.start_ms + OVERLAP_SLACK_MS
  );
}

/**
 * Where clip `index`'s `edge` may go from the transcript: after the clip before it, before the clip
 * after it, a second from its other edge, and no later than `endMs` (the debate's last word), or
 * where the clip already ends if that is later.
 */
export function edgeBounds(
  clips: readonly Pick<EditorClip, 'start_ms' | 'end_ms'>[],
  index: number,
  edge: 'start' | 'end',
  endMs: number
): [number, number] {
  const clip = clips[index];
  let low = 0;
  let high = Math.max(endMs, clip.end_ms);
  clips.forEach((other, at) => {
    if (at === index) return;
    if (other.end_ms <= clip.start_ms + OVERLAP_SLACK_MS) low = Math.max(low, other.end_ms);
    if (other.start_ms >= clip.end_ms - OVERLAP_SLACK_MS) high = Math.min(high, other.start_ms);
  });
  return edge === 'start' ? [low, clip.end_ms - MIN_EDIT_CLIP_MS] : [clip.start_ms + MIN_EDIT_CLIP_MS, high];
}

/**
 * Clip `index` with one edge moved to `ms` from the transcript (a handle's drag or arrow keys), or
 * `null` when it can't go there: it would leave the clip shorter than a second, run into another
 * clip or past `endMs` (`edgeBounds`). A free placement (Alt, Shift+arrow) is clamped to what fits
 * and kept exactly there; a word edge is all or nothing, since geo-chat would widen a clamped one
 * back into the next clip.
 */
export function movedEdge(
  clips: readonly EditorClip[],
  index: number,
  edge: 'start' | 'end',
  ms: number,
  free: boolean,
  endMs: number
): EditorClip | null {
  const clip = clips[index];
  if (!clip) return null;
  const [min, max] = edgeBounds(clips, index, edge, endMs);
  if (min > max) return null;
  let at = ms;
  if (free) at = Math.min(Math.max(at, min), max);
  else if (at < min || at > max) return null;
  if (at === (edge === 'start' ? clip.start_ms : clip.end_ms)) return null;
  return edge === 'start'
    ? { ...clip, start_ms: at, ...(free && { free_start_ms: at }) }
    : { ...clip, end_ms: at, ...(free && { free_end_ms: at }) };
}

/**
 * Where the selection toolbar sits in the side panel (the prototype's `readSelection`): under the
 * selection's last word, or above its first when there is no room below, kept 8 px inside the panel.
 * Rects are the viewport's; the result is from the panel's top.
 */
export function toolbarTop(
  first: Pick<DOMRect, 'top'>,
  last: Pick<DOMRect, 'bottom'>,
  panel: Pick<DOMRect, 'top' | 'height'>,
  barHeight: number
): number {
  let top = last.bottom - panel.top + 6;
  if (top + barHeight > panel.height - 8) top = first.top - panel.top - barHeight - 6;
  return Math.min(Math.max(top, 8), Math.max(8, panel.height - barHeight - 8));
}

/**
 * Word `index`'s element. The transcript's children are the turns' blocks in order, so with each
 * word's turn (`turnOfWord`) this searches one turn, not the whole debate.
 */
function wordIn(root: Element, turnOfWord: Int32Array, index: number): Element | null {
  const selector = `[data-word="${index}"]`;
  const turn = index >= 0 && index < turnOfWord.length ? root.children[turnOfWord[index]] : undefined;
  return turn?.querySelector(selector) ?? root.querySelector(selector);
}

/** Scrolls `box` so `element` sits `fraction` of the way down it. */
function scrollWord(box: HTMLElement, element: Element | null, fraction: number) {
  if (!element) return;
  const at = element.getBoundingClientRect();
  const view = box.getBoundingClientRect();
  box.scrollTop += at.top - view.top - view.height * fraction;
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
 * The transcript's word spans a selection covers, in document order (GEO-3766): the one rule for
 * which words a selection picks. A word partly selected counts whole; one the selection only touches
 * the edge of doesn't.
 */
export function coveredWords(range: Range, root: Element): HTMLElement[] {
  if (range.collapsed) return [];
  return [...root.querySelectorAll<HTMLElement>('[data-word]')].filter(
    element => range.intersectsNode(element) && coversText(range, element)
  );
}

/**
 * The words a selection covers (`coveredWords`), as the first and last index into the editor's
 * words, or `null` when it covers none (GEO-3766). An end that rests off a word (a timecode, a
 * clip's number, the space between words) counts from the nearest word inside the selection.
 */
export function selectedWordRange(covered: readonly HTMLElement[]): [number, number] | null {
  if (covered.length === 0) return null;
  const indexes = covered.map(element => Number(element.dataset.word));
  return [Math.min(...indexes), Math.max(...indexes)];
}

/** The space Whisper puts before a word, outside its span, so it reads as text without selecting it. */
function wordGap(text: string, firstInTurn: boolean) {
  if (firstInTurn) return '';
  if (/^\s/.test(text)) return ' ';
  return /^[.,!?;:%)\]}'’”-]/.test(text) ? '' : ' ';
}

/** A clip's words: a light tint of the speaker's colour over an underline in its ink. */
const WORD_CLASS = {
  1: 'text-text bg-purple/10 shadow-[inset_0_-2px_0_var(--color-purple)]',
  2: 'text-text bg-pink/10 shadow-[inset_0_-2px_0_#c5168f]',
  none: 'text-text bg-grey-01 shadow-[inset_0_-2px_0_var(--color-grey-03)]',
} as const;
/** The selected clip's words: the tint stronger. */
const WORD_STRONG_CLASS = { 1: 'bg-purple/25', 2: 'bg-pink/25', none: 'bg-grey-02' } as const;
const HANDLE_CLASS = { 1: 'bg-purple', 2: 'bg-[#c5168f]', none: 'bg-grey-04' } as const;
const HANDLE_GLOW_CLASS = {
  1: 'shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-purple)_35%,transparent)]',
  2: 'shadow-[0_0_0_3px_color-mix(in_srgb,#c5168f_35%,transparent)]',
  none: 'shadow-[0_0_0_3px_var(--color-grey-02)]',
} as const;
/**
 * The word at the playhead: underlined in the text colour. Set from the playhead's frame as a
 * `data-playhead` attribute React never renders, so moving it re-renders nothing and a render keeps it.
 */
const PLAYHEAD_CLASS =
  'data-[playhead]:text-text data-[playhead]:underline data-[playhead]:decoration-text data-[playhead]:decoration-2 data-[playhead]:underline-offset-[5px]';

const speakerKey = (speaker: ParticipantSlot | null) => (speaker === 1 || speaker === 2 ? speaker : 'none');

/** What the editor does for the transcript. Held in a ref the editor refreshes, so it never re-renders it. */
export type TranscriptActions = {
  /** Selects a clip from the transcript (its number, one of its words): the transcript doesn't scroll. */
  selectClip: (key: string) => void;
  /** A click on a word outside the selected clip: stop, and go to the word. */
  seekWord: (ms: number) => void;
  /** Puts the playhead at `ms`, as a set or moved edge does. */
  seek: (ms: number) => void;
  changeClip: (index: number, clip: EditorClip) => void;
  /** Sets clip `index` to exactly `span`, a selection's words. */
  setClipWords: (index: number, span: { start_ms: number; end_ms: number }) => void;
  /** Adds a clip of exactly `span`, a selection's words, and selects it. */
  addClipWords: (span: { start_ms: number; end_ms: number }) => void;
  /** Whether the player is playing now: the transcript follows the playhead only then. */
  playing: () => boolean;
};

/** Until the editor fills them in. */
export const NO_TRANSCRIPT_ACTIONS: TranscriptActions = {
  selectClip: () => {},
  seekWord: () => {},
  seek: () => {},
  changeClip: () => {},
  setClipWords: () => {},
  addClipWords: () => {},
  playing: () => false,
};

type PlayheadSubscribe = (listener: (positionMs: number) => void) => () => void;

type Drag = { edge: 'start' | 'end'; tip: string };
type WordPick = { from: number; to: number };

/**
 * The debate's whole transcript in the side panel (GEO-3773, the prototype's side transcript), turn by
 * turn: every clip's words marked, its number at its first word; the selected clip's edges dragged
 * word by word; words searched; a word clicked to go there or pick its clip; words selected to set
 * the selected clip to them or make a new clip (GEO-3766); the playhead's word underlined.
 *
 * Long debates (60–90 minutes, 10–15k words) stay smooth: each turn is kept from re-rendering while
 * its marks are unchanged, the playhead's word and the follow scroll are written from the playhead's
 * frame without a render, and the editor's actions come through a ref, so a render of the editor
 * (a playhead report, a drag elsewhere) doesn't render the transcript at all.
 */
export const ReelTranscript = React.memo(function ReelTranscript({
  sentences,
  words,
  wordTiming,
  turns,
  clips,
  speakers,
  selected,
  was,
  editable,
  readOnly,
  names,
  subscribe,
  actions,
}: {
  sentences: readonly ReelSentence[];
  /** The editor's words (`playerWords`): what a word's `data-word` index points into. */
  words: readonly ReelWord[];
  /** The transcript's `word_timing`: `false` when it has no word timings to select by. */
  wordTiming: boolean | undefined;
  turns: readonly DebateMediaTurnSegment[];
  clips: readonly EditorClip[];
  /** Each clip's speaker. Memoised by the editor: a new list re-renders the transcript. */
  speakers: readonly (ParticipantSlot | null)[];
  /** The selected clip's index, or -1 (none, or the reel playing). */
  selected: number;
  /** Where the live reel has the selected clip, when it was edited since: outlined as "was". */
  was: { start_ms: number; end_ms: number } | null;
  /** Whether the selected clip's edges can be moved here (its handles). */
  editable: boolean;
  /** Nothing can be changed: a selection only reads out its times. */
  readOnly: boolean;
  names: TranscriptNames;
  subscribe: PlayheadSubscribe;
  actions: React.RefObject<TranscriptActions>;
}) {
  transcriptRenders += 1;
  const shownWords = React.useMemo(() => wordsBySentence(sentences, words), [sentences, words]);
  const turnList = React.useMemo(() => transcriptTurns(sentences, shownWords), [sentences, shownWords]);
  // Each word's turn, so finding a word's element searches one turn's block, not all 15,000 words:
  // the playhead's frame looks one up at every word it reaches.
  const turnOfWord = React.useMemo(() => {
    const of = new Int32Array(words.length).fill(-1);
    turnList.forEach((turn, at) => {
      for (const item of turn.items) if ('word' in item) of[item.word] = at;
    });
    return of;
  }, [turnList, words.length]);

  // Which clip plays each word (the first, as geo-chat counts a clip's words: `wordsIn`), and each
  // clip's first and last word.
  const owners = React.useMemo(() => {
    const owner = new Int16Array(words.length).fill(-1);
    const first = clips.map(() => -1);
    const last = clips.map(() => -1);
    clips.forEach((clip, index) => {
      words.forEach((word, at) => {
        if (!wordInSpan(word, clip)) return;
        if (owner[at] < 0) owner[at] = index;
        if (first[index] < 0) first[index] = at;
        last[index] = at;
      });
    });
    return { owner, first, last };
  }, [words, clips]);
  // A transcript without word timings marks clips by sentence: which clip each sentence is in (the
  // first, as with words), and each clip's first sentence, where its number shows once. With word
  // timings the clips are marked on their words (`clipSpeaker`'s rule too): a sentence with no word to
  // show is left untinted, with each clip it is in numbered after it.
  const hasWords = words.length > 0;
  const sentenceOwners = React.useMemo(() => {
    const owner = new Int16Array(sentences.length).fill(-1);
    const first = clips.map(() => -1);
    const after = sentences.map(() => [] as number[]);
    clips.forEach((clip, index) => {
      sentences.forEach((sentence, at) => {
        if (!sentenceInClip(sentence, clip)) return;
        if (hasWords) {
          after[at].push(index);
          return;
        }
        if (owner[at] < 0) owner[at] = index;
        if (first[index] < 0) first[index] = at;
      });
    });
    return { owner, first, after };
  }, [sentences, clips, hasWords]);
  const wasWords = React.useMemo(() => {
    const out = new Set<number>();
    if (!was || selected < 0) return out;
    words.forEach((word, at) => {
      if (wordInSpan(word, was) && owners.owner[at] !== selected) out.add(at);
    });
    return out;
  }, [was, selected, words, owners]);

  const [query, setQuery] = React.useState('');
  const [hitAt, setHitAt] = React.useState(0);
  // Keyed on what is searched for, not the box's text: a space typed before the next word is the
  // same search, so it keeps the hit in view instead of going back to the first (and the top).
  const needle = query.trim().toLowerCase();
  const hits = React.useMemo(() => searchHits(words, needle), [words, needle]);
  const hitWords = React.useMemo(() => {
    const out = new Set<number>();
    for (const [from, to] of hits) for (let at = from; at <= to; at += 1) out.add(at);
    return out;
  }, [hits]);

  const [drag, setDrag] = React.useState<Drag | null>(null);
  const handles = editable && selected >= 0 && owners.first[selected] >= 0;
  // No edge goes past the debate's last word (or where its clip already ends, if later).
  const endMs = words.length > 0 ? words[words.length - 1].end_ms : 0;
  const bounds = React.useMemo(
    () =>
      handles
        ? { start: edgeBounds(clips, selected, 'start', endMs), end: edgeBounds(clips, selected, 'end', endMs) }
        : null,
    [handles, clips, selected, endMs]
  );

  // Each turn's marks as a string: a turn re-renders only when its own words' marks change.
  const marks = React.useMemo(
    () =>
      turnList.map(turn =>
        turn.items
          .map(item => {
            if (!('word' in item)) {
              const owner = sentenceOwners.owner[item.sentence];
              const starts = clips.flatMap((_, index) =>
                sentenceOwners.first[index] === item.sentence ? [`${index}${speakers[index] ?? ''}`] : []
              );
              const after = sentenceOwners.after[item.sentence].map(index => `${index}${speakers[index] ?? ''}`);
              return `s${owner}${owner >= 0 ? (speakers[owner] ?? '') : ''}${owner >= 0 && owner === selected ? '*' : ''}f${starts.join('.')}a${after.join('.')}`;
            }
            const at = item.word;
            const owner = owners.owner[at];
            let mark = owner < 0 ? '' : `${owner}${speakers[owner] ?? ''}`;
            if (owner >= 0 && owners.first[owner] === at) mark += 'f';
            if (owner >= 0 && owner === selected) mark += '*';
            // A handle's word also redraws when its edge moves within the word (Alt, Shift+arrow).
            if (bounds && owners.first[selected] === at) {
              mark += `<${clips[selected].start_ms}:${bounds.start}${drag?.edge === 'start' ? drag.tip : ''}`;
            }
            if (bounds && owners.last[selected] === at) {
              mark += `>${clips[selected].end_ms}:${bounds.end}${drag?.edge === 'end' ? drag.tip : ''}`;
            }
            if (wasWords.has(at)) mark += 'w';
            if (hitWords.has(at)) mark += 'h';
            return mark;
          })
          .join(',')
      ),
    [turnList, clips, speakers, owners, sentenceOwners, selected, bounds, drag, wasWords, hitWords]
  );

  const noWordTimings = sentences.length > 0 && (wordTiming === false || words.length === 0);
  const canPick = !noWordTimings;

  const panelRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const turnOfWordRef = React.useRef(turnOfWord);
  turnOfWordRef.current = turnOfWord;
  const wordElement = (root: HTMLElement, index: number) => wordIn(root, turnOfWordRef.current, index);

  // The playhead's word, from the playhead's frame: no render (see PLAYHEAD_CLASS).
  const playheadRef = React.useRef<{ word: number; element: Element | null }>({ word: -1, element: null });
  const markPlayhead = React.useCallback(
    (positionMs: number | null, follow: boolean) => {
      const root = rootRef.current;
      if (!root || words.length === 0) return;
      const word = positionMs === null ? playheadRef.current.word : wordAt(words, positionMs);
      // Most frames land on the word already marked: nothing to look up.
      const known = playheadRef.current;
      if (word === known.word && known.element?.isConnected && positionMs !== null) return;
      const element = word < 0 ? null : wordIn(root, turnOfWordRef.current, word);
      const previous = playheadRef.current.element;
      if (previous !== element) {
        previous?.removeAttribute('data-playhead');
        element?.setAttribute('data-playhead', '');
      }
      playheadRef.current = { word, element };
      if (!follow || !element || element === previous) return;
      const at = element.getBoundingClientRect();
      const view = root.getBoundingClientRect();
      if (at.top < view.top || at.bottom > view.bottom) scrollWord(root, element, 0.25);
    },
    [words]
  );
  React.useEffect(
    () => subscribe(positionMs => markPlayhead(positionMs, actions.current.playing())),
    [subscribe, markPlayhead, actions]
  );
  // A render can swap a word's element (new words): the mark goes back on the word's element now.
  React.useLayoutEffect(() => markPlayhead(null, false));

  // The selected clip comes into view when it is picked anywhere but here, and when the transcript
  // comes back (✕ on a panel): its first word, a fifth of the way down (its first sentence on a
  // transcript without word timings). With none, the playhead's word.
  const pickedHere = React.useRef(false);
  const selectedKey = selected >= 0 ? (clips[selected]?.key ?? null) : null;
  const firstOfSelected = selected >= 0 ? (hasWords ? owners.first[selected] : sentenceOwners.first[selected]) : -1;
  const firstRef = React.useRef(firstOfSelected);
  firstRef.current = firstOfSelected;
  const hasWordsRef = React.useRef(hasWords);
  hasWordsRef.current = hasWords;
  React.useEffect(() => {
    const root = rootRef.current;
    if (pickedHere.current) {
      pickedHere.current = false;
      return;
    }
    if (!root || selectedKey === null || firstRef.current < 0) return;
    const element = hasWordsRef.current
      ? wordElement(root, firstRef.current)
      : root.querySelector(`[data-sentence="${firstRef.current}"]`);
    scrollWord(root, element, 0.22);
  }, [selectedKey]);
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || firstRef.current >= 0) return;
    scrollWord(root, playheadRef.current.element, 0.22);
  }, []);
  const selectHere = (key: string) => {
    pickedHere.current = key !== selectedKey;
    actions.current.selectClip(key);
  };

  // Search: the hit in view, and Enter / Shift+Enter to the next or previous one.
  const goToHit = (at: number) => {
    const root = rootRef.current;
    const hit = hits[at];
    if (root && hit) scrollWord(root, wordElement(root, hit[0]), 0.3);
  };
  // A new search goes to its first hit; one with no hits leaves the transcript where it is.
  React.useEffect(() => {
    setHitAt(0);
    goToHit(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits]);
  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || hits.length === 0) return;
    event.preventDefault();
    const next = (hitAt + (event.shiftKey ? -1 : 1) + hits.length) % hits.length;
    setHitAt(next);
    goToHit(next);
  };

  // Text selection → the toolbar (GEO-3766): a drag is read when it ends, a keyboard selection once
  // it rests.
  const pointerDown = React.useRef(false);
  const [pick, setPick] = React.useState<WordPick | null>(null);
  const activeRange = React.useCallback((): Range | null => {
    const selection = window.getSelection();
    const root = rootRef.current;
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !root) return null;
    // Only words picked in the transcript: a selection pressed elsewhere or of the whole page (Cmd+A,
    // anchored on `body`) is not one. Where it was pressed decides, not where it ends: a drag past
    // the box's edge autoscrolls the box and ends on whatever is under the pointer outside it.
    return selection.anchorNode && root.contains(selection.anchorNode) ? selection.getRangeAt(0) : null;
  }, []);
  const readPick = React.useCallback(() => {
    const range = activeRange();
    const root = rootRef.current;
    if (!range || !root) return setPick(null);
    const picked = selectedWordRange(coveredWords(range, root));
    setPick(picked ? { from: picked[0], to: picked[1] } : null);
  }, [activeRange]);
  React.useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onSelectionChange = () => {
      clearTimeout(settle);
      if (!activeRange()) {
        setPick(null);
        return;
      }
      if (!pointerDown.current) settle = setTimeout(readPick, SELECTION_SETTLE_MS);
    };
    // A press ends with `pointerup`, or, when the browser takes the gesture over (a drag of selected
    // text, a touch turned into a scroll), with `pointercancel` and `dragend` instead.
    const onPressEnd = () => {
      if (!pointerDown.current) return;
      pointerDown.current = false;
      readPick();
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
  const closePick = React.useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setPick(null);
  }, []);
  // Esc closes the toolbar first, before the editor's Esc (panel, then the selection) sees it.
  React.useEffect(() => {
    if (!pick) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closePick();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [pick, closePick]);

  const result: SelectionClip | null = pick && canPick ? selectionToClip(words, pick.from, pick.to, turns) : null;
  // Under the selection's last word, inside the side panel; read once it is drawn, as it is sized.
  React.useLayoutEffect(() => {
    const bar = toolbarRef.current;
    const panel = panelRef.current;
    const root = rootRef.current;
    if (!bar || !panel || !root || !pick) return;
    const first = wordElement(root, pick.from);
    const last = wordElement(root, pick.to);
    if (!first || !last) return;
    bar.style.top = `${toolbarTop(first.getBoundingClientRect(), last.getBoundingClientRect(), panel.getBoundingClientRect(), bar.offsetHeight)}px`;
  }, [pick, result]);

  // Edge handles: dragged word by word, always landing on word edges, the box scrolling near its edges.
  // Handlers read the transcript as it is now: a turn whose marks didn't change keeps older ones.
  const latest = React.useRef({ clips, words, selected, owners, handles, endMs });
  latest.current = { clips, words, selected, owners, handles, endMs };
  // The click that ends a drag lands on the handle's word (the press and the release's common
  // ancestor): it is the drag's, not a click on the word.
  const dragEnded = React.useRef(false);
  // A word step moves the handle into the next word's span: focus follows it there.
  const refocus = React.useRef<'start' | 'end' | null>(null);
  React.useLayoutEffect(() => {
    const edge = refocus.current;
    if (!edge) return;
    refocus.current = null;
    // Only when the step took focus away with the old handle: never pulled from elsewhere.
    const lost = document.activeElement === null || document.activeElement === document.body;
    const handle = rootRef.current?.querySelector<HTMLElement>(`[role="slider"][data-edge="${edge}"]`);
    if (handle && lost) handle.focus({ preventScroll: true });
  });
  const tipFor = (clip: EditorClip, edge: 'start' | 'end', word: ReelWord | undefined) =>
    `${formatReelTime(edge === 'start' ? clip.start_ms : clip.end_ms)} · “${word?.text.trim() ?? ''}”`;
  const seekToEdge = (clip: EditorClip, edge: 'start' | 'end') =>
    actions.current.seek(edge === 'start' ? clip.start_ms : Math.max(clip.start_ms, clip.end_ms - 1_000));
  const startDrag = (event: React.PointerEvent, edge: 'start' | 'end') => {
    if (event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    const clip = latest.current.clips[latest.current.selected];
    if (!clip) return;
    const edgeWord = latest.current.owners[edge === 'start' ? 'first' : 'last'][latest.current.selected];
    setDrag({ edge, tip: tipFor(clip, edge, latest.current.words[edgeWord]) });
    let moved: EditorClip | null = null;
    const onMove = (move: PointerEvent) => {
      // Let go where no pointerup reached us (another window), or the handles went (a lock, the reel).
      if (move.buttons === 0 || !latest.current.handles) return onUp();
      const root = rootRef.current;
      const now = latest.current;
      const current = moved ?? now.clips[now.selected];
      if (!root || !current) return;
      const box = root.getBoundingClientRect();
      if (move.clientY < box.top + 18) root.scrollTop -= 14;
      else if (move.clientY > box.bottom - 18) root.scrollTop += 14;
      const span = wordUnder(root, move.clientX, move.clientY);
      if (!span) return;
      const word = now.words[Number(span.dataset.word)];
      if (!word) return;
      const next = movedEdge(
        now.clips.map((clip, at) => (at === now.selected ? current : clip)),
        now.selected,
        edge,
        edge === 'start' ? word.start_ms : word.end_ms,
        false,
        now.endMs
      );
      if (!next) return;
      moved = next;
      actions.current.changeClip(now.selected, next);
      setDrag({ edge, tip: tipFor(next, edge, word) });
    };
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
      setDrag(null);
      // The release's click comes in this same task, before any timer.
      dragEnded.current = true;
      setTimeout(() => {
        dragEnded.current = false;
      }, 0);
      if (moved) seekToEdge(moved, edge);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
  };
  /** Arrow keys on a handle: a word at a time; with Shift, a tenth of a second. */
  const onHandleKey = (event: React.KeyboardEvent, edge: 'start' | 'end') => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const { clips, words, selected, endMs } = latest.current;
    const clip = clips[selected];
    if (!clip) return;
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const from = edge === 'start' ? clip.start_ms : clip.end_ms;
    const next = event.shiftKey
      ? movedEdge(clips, selected, edge, from + direction * FREE_STEP_MS, true, endMs)
      : movedEdge(clips, selected, edge, stepEdge(from, words, edge, direction), false, endMs);
    if (!next) return;
    if (event.currentTarget === document.activeElement) refocus.current = edge;
    actions.current.changeClip(selected, next);
    seekToEdge(next, edge);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button > 0 || (event.target as Element).closest('button, [role="slider"]')) return;
    pointerDown.current = true;
  };
  const onClick = (event: React.MouseEvent) => {
    const target = event.target as Element;
    const chip = target.closest<HTMLElement>('[data-clip]');
    if (chip) {
      const key = clips[Number(chip.dataset.clip)]?.key;
      if (key) selectHere(key);
      return;
    }
    const span = target.closest<HTMLElement>('[data-word]');
    if (!span || target.closest('[role="slider"]') || dragEnded.current) return;
    // The end of a drag that selected words is not a click on one.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const at = Number(span.dataset.word);
    const owner = owners.owner[at] ?? -1;
    if (owner >= 0 && owner !== selected && clips[owner]) selectHere(clips[owner].key);
    else if (words[at]) actions.current.seekWord(words[at].start_ms);
  };

  const nameOf = (slot: ParticipantSlot | null) => (slot === 1 || slot === 2 ? names[slot] : null);
  const handleFor = (edge: 'start' | 'end') =>
    handles
      ? {
          edge,
          clip: clips[selected],
          bounds: bounds?.[edge] ?? [0, 0],
          speaker: speakers[selected] ?? null,
          dragging: drag?.edge === edge,
          tip: drag?.edge === edge ? drag.tip : null,
          onPointerDown: (event: React.PointerEvent) => startDrag(event, edge),
          onKeyDown: (event: React.KeyboardEvent) => onHandleKey(event, edge),
        }
      : null;
  const startHandle = handleFor('start');
  const endHandle = handleFor('end');

  return (
    <div ref={panelRef} className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none flex-col gap-2.5 border-b border-divider px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon />
            <input
              type="search"
              autoComplete="off"
              aria-label="Search the transcript"
              placeholder="Search the transcript"
              value={query}
              onChange={event => {
                setQuery(event.target.value);
              }}
              onKeyDown={onSearchKey}
              className="w-full appearance-none rounded border-0 bg-white py-[9px] pr-2.5 pl-9 text-input shadow-inner-grey-02 outline-none placeholder:text-grey-03 hover:shadow-inner-text focus:shadow-inner-lg-text"
            />
          </div>
          <span aria-live="polite" className="text-breadcrumb whitespace-nowrap text-grey-04 tabular-nums">
            {query.trim()
              ? hits.length > 0
                ? `${Math.min(hitAt, hits.length - 1) + 1} of ${hits.length}`
                : 'No matches'
              : ''}
          </span>
        </div>
      </div>
      {noWordTimings ? (
        <p className="flex-none border-b border-divider px-3 py-2 text-metadata text-grey-04">
          This transcript has no word timings, so clips can&apos;t be made from a selection.
        </p>
      ) : null}
      {sentences.length === 0 ? (
        <p className="p-3 text-metadata text-grey-04">No transcript.</p>
      ) : (
        <div
          ref={rootRef}
          data-testid="reel-transcript"
          role="region"
          aria-label="Transcript of the whole debate"
          // Scrollable, so reachable from the keyboard.
          tabIndex={0}
          className="relative min-h-0 flex-1 overflow-auto overscroll-contain pt-1.5 pr-3.5 pb-6 pl-1 outline-none [&_::selection]:bg-ctaPrimary/20"
          onPointerDown={onPointerDown}
          onClick={onClick}
          onScroll={() => {
            if (pick) setPick(null);
          }}
        >
          {turnList.map((turn, at) => (
            <TurnBlock
              key={turn.key}
              turn={turn}
              marks={marks[at]}
              name={nameOf(turn.slot)}
              words={words}
              sentences={sentences}
              owners={owners}
              sentenceOwners={sentenceOwners}
              speakers={speakers}
              clips={clips}
              selected={selected}
              wasWords={wasWords}
              hitWords={hitWords}
              startHandle={startHandle}
              endHandle={endHandle}
            />
          ))}
        </div>
      )}
      {result && pick ? (
        <div
          ref={toolbarRef}
          role="group"
          aria-label="Clip from the selected words"
          // Clicking the toolbar must not clear the selection.
          onMouseDown={event => event.preventDefault()}
          className="absolute left-[34px] z-10 flex w-[292px] flex-col gap-2 rounded-lg border border-grey-02 bg-white px-3 pt-2.5 pb-3 shadow-lg select-none"
        >
          <SelectionToolbar
            picked={{ start_ms: words[pick.from].start_ms, end_ms: words[pick.to].end_ms }}
            result={result}
            clips={clips}
            selected={selected}
            readOnly={readOnly}
            nameOf={nameOf}
            onSet={span => {
              actions.current.setClipWords(selected, span);
              actions.current.seek(span.start_ms);
              closePick();
            }}
            onAdd={span => {
              pickedHere.current = true;
              actions.current.addClipWords(span);
              actions.current.seek(span.start_ms);
              closePick();
            }}
          />
        </div>
      ) : null}
    </div>
  );
});

/** The word span under a point: the element there, or the caret's (between lines, past a line's end). */
function wordUnder(root: Element, x: number, y: number): HTMLElement | null {
  const element = document.elementFromPoint?.(x, y);
  const span = element?.closest<HTMLElement>('[data-word]');
  if (span && root.contains(span)) return span;
  const caret = (
    document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
  ).caretRangeFromPoint?.(x, y);
  if (!caret || !root.contains(caret.startContainer)) return null;
  const node = caret.startContainer;
  const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const own = parent?.closest<HTMLElement>('[data-word]');
  if (own) return own;
  const before = node.previousSibling;
  return before instanceof HTMLElement && before.dataset.word !== undefined ? before : null;
}

type Handle = {
  edge: 'start' | 'end';
  clip: EditorClip;
  /** Where this edge may go (`edgeBounds`): the slider's range. */
  bounds: [number, number];
  speaker: ParticipantSlot | null;
  dragging: boolean;
  tip: string | null;
  onPointerDown: (event: React.PointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
};

let turnRenders = 0;
let transcriptRenders = 0;
/** How many times a turn has rendered: for the long-transcript render test. */
export function turnRenderCount() {
  return turnRenders;
}
/** How many times the transcript itself has rendered: for the same test. */
export function transcriptRenderCount() {
  return transcriptRenders;
}

/**
 * One turn: its timecode, its speaker, its words. Kept from re-rendering while its marks are
 * unchanged (`marks` says what this turn's words show), so a drag or a search redraws only the turns
 * it touches, not every word of a long debate.
 */
const TurnBlock = React.memo(
  function TurnBlock({
    turn,
    name,
    words,
    sentences,
    owners,
    sentenceOwners,
    speakers,
    clips,
    selected,
    wasWords,
    hitWords,
    startHandle,
    endHandle,
  }: {
    turn: TranscriptTurn;
    marks: string;
    name: string | null;
    words: readonly ReelWord[];
    sentences: readonly ReelSentence[];
    owners: { owner: Int16Array; first: number[]; last: number[] };
    sentenceOwners: { owner: Int16Array; first: number[]; after: number[][] };
    speakers: readonly (ParticipantSlot | null)[];
    clips: readonly EditorClip[];
    selected: number;
    wasWords: ReadonlySet<number>;
    hitWords: ReadonlySet<number>;
    startHandle: Handle | null;
    endHandle: Handle | null;
  }) {
    turnRenders += 1;
    const parts: React.ReactNode[] = [];
    turn.items.forEach((item, nth) => {
      const next = turn.items[nth + 1];
      if (!('word' in item)) {
        // A sentence with no words (a transcript without word timings): tinted as its clip's words
        // are, the clip's number shown once, before the clip's first sentence. In a word-timed
        // transcript it is untinted, numbered after it for each clip it is in (`sentenceOwners`).
        const at = item.sentence;
        const owner = sentenceOwners.owner[at];
        const speaker = owner >= 0 ? speakerKey(speakers[owner] ?? null) : null;
        const gap = next ? ' ' : '';
        // Within one clip the space is the clip's, so its tint runs on unbroken.
        const joined =
          owner >= 0 && next !== undefined && 'sentence' in next && sentenceOwners.owner[next.sentence] === owner;
        parts.push(
          <React.Fragment key={`s${at}`}>
            {clips.flatMap((_, index) =>
              sentenceOwners.first[index] === at
                ? [<ClipButton key={index} index={index} speaker={speakers[index] ?? null} />]
                : []
            )}
            <span
              data-sentence={at}
              className={cx(
                'py-0.5',
                speaker && WORD_CLASS[speaker],
                speaker && owner === selected && WORD_STRONG_CLASS[speaker]
              )}
            >
              {sentences[at].text}
              {joined ? gap : null}
            </span>
            {sentenceOwners.after[at].map(index => (
              <ClipButton key={`a${index}`} index={index} speaker={speakers[index] ?? null} after />
            ))}
            {joined ? null : gap}
          </React.Fragment>
        );
        return;
      }
      const at = item.word;
      const word = words[at];
      const owner = owners.owner[at];
      const speaker = owner >= 0 ? speakerKey(speakers[owner] ?? null) : null;
      const nextGap = next && 'word' in next ? wordGap(words[next.word].text, false) : next ? ' ' : '';
      // Within one clip the space is the clip's, so its tint runs on unbroken.
      const joined = owner >= 0 && next !== undefined && 'word' in next && owners.owner[next.word] === owner;
      const start = startHandle && owners.first[selected] === at ? startHandle : null;
      const end = endHandle && owners.last[selected] === at ? endHandle : null;
      parts.push(
        <React.Fragment key={at}>
          {owner >= 0 && owners.first[owner] === at ? (
            <ClipButton index={owner} speaker={speakers[owner] ?? null} />
          ) : null}
          <span
            data-word={at}
            className={cx(
              'cursor-text py-0.5',
              PLAYHEAD_CLASS,
              speaker && WORD_CLASS[speaker],
              speaker && owner === selected && WORD_STRONG_CLASS[speaker],
              (start || end) && 'relative',
              wasWords.has(at) && 'outline-1 outline-offset-1 outline-grey-03 outline-dashed',
              hitWords.has(at) && '!bg-ctaPrimary/15'
            )}
          >
            {word.text.trim()}
            {joined ? nextGap : null}
            {start ? <EdgeHandle handle={start} /> : null}
            {end ? <EdgeHandle handle={end} /> : null}
          </span>
          {joined ? null : nextGap}
        </React.Fragment>
      );
    });
    return (
      <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-2 py-[5px]">
        <span className="text-right text-[12px] leading-6 text-grey-03 tabular-nums select-none">
          {formatTimecode(turn.start_ms)}
        </span>
        <div className="text-[15px] leading-6 tracking-[-0.1px] text-grey-05">
          <span
            className={cx(
              'mr-1.5 inline-flex items-center gap-[5px] align-[1px] text-[13px] leading-[15px] font-medium select-none',
              SPEAKER_TEXT_CLASS[turn.slot]
            )}
          >
            <i aria-hidden className={cx('block h-[7px] w-[7px] rounded-full', SPEAKER_FILL_CLASS[turn.slot])} />
            {name}
          </span>
          {parts}
        </div>
      </div>
    );
  },
  (before, after) =>
    before.turn === after.turn &&
    before.marks === after.marks &&
    before.name === after.name &&
    before.words === after.words &&
    before.sentences === after.sentences
);

function ClipButton({ index, speaker, after }: { index: number; speaker: ParticipantSlot | null; after?: boolean }) {
  return (
    <button
      type="button"
      data-clip={index}
      aria-label={`Select clip ${index + 1}`}
      className={cx(
        'inline-flex cursor-pointer border-0 bg-transparent p-0 align-[1px] select-none',
        after ? 'ml-1.5' : 'mr-[3px]'
      )}
    >
      <ClipChip number={index + 1} speaker={speaker} small />
    </button>
  );
}

function EdgeHandle({ handle }: { handle: Handle }) {
  const { edge, clip, bounds, speaker, dragging, tip } = handle;
  const key = speakerKey(speaker);
  const at = edge === 'start' ? clip.start_ms : clip.end_ms;
  return (
    <>
      <span
        role="slider"
        tabIndex={0}
        data-edge={edge}
        aria-label={edge === 'start' ? 'Clip start' : 'Clip end'}
        aria-valuemin={Math.min(bounds[0], at)}
        aria-valuemax={Math.max(bounds[1], at)}
        aria-valuenow={at}
        aria-valuetext={formatReelTime(at)}
        onPointerDown={handle.onPointerDown}
        onKeyDown={handle.onKeyDown}
        className={cx(
          'absolute -top-px -bottom-px z-[2] w-[3px] cursor-ew-resize touch-none rounded-sm select-none before:absolute before:inset-y-0 before:-right-1.5 before:-left-1.5 before:content-[""] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text',
          edge === 'start' ? '-left-0.5' : '-right-0.5',
          HANDLE_CLASS[key],
          dragging && HANDLE_GLOW_CLASS[key]
        )}
      />
      {tip ? (
        <span
          role="tooltip"
          className={cx(
            'pointer-events-none absolute bottom-[calc(100%+6px)] z-[3] rounded bg-text px-2 py-1 text-breadcrumb whitespace-nowrap text-white tabular-nums select-none',
            edge === 'start' ? '-left-px -translate-x-1/2' : '-right-px translate-x-1/2'
          )}
        >
          {tip}
        </span>
      ) : null}
    </>
  );
}

function SelectionToolbar({
  picked,
  result,
  clips,
  selected,
  readOnly,
  nameOf,
  onSet,
  onAdd,
}: {
  /** The selected words' times, as the toolbar reads them out. */
  picked: { start_ms: number; end_ms: number };
  result: SelectionClip;
  clips: readonly EditorClip[];
  /** The selected clip's index, or -1 when none is (then only a new clip is offered). */
  selected: number;
  readOnly: boolean;
  nameOf: (slot: ParticipantSlot | null) => string | null;
  onSet: (span: { start_ms: number; end_ms: number }) => void;
  onAdd: (span: { start_ms: number; end_ms: number }) => void;
}) {
  const shown = result.ok ? result : picked;
  const range = (
    <span className="text-breadcrumb text-grey-04 tabular-nums">
      {formatReelTime(shown.start_ms)} to {formatReelTime(shown.end_ms)},{' '}
      {((shown.end_ms - shown.start_ms) / 1000).toFixed(1)} s
    </span>
  );
  if (!result.ok) {
    return (
      <>
        {range}
        <Note>
          {result.reason === 'crosses-cut'
            ? 'These words cross a cut in the video. Pick words from one stretch.'
            : 'No words selected.'}
        </Note>
      </>
    );
  }
  const span = { start_ms: result.start_ms, end_ms: result.end_ms };
  const other = result.speaker === 1 ? 2 : 1;
  const overSet = selected >= 0 ? overlappedClip(clips, span, selected) : -1;
  const overNew = overlappedClip(clips, span);
  const canNew = clips.length < MANUAL_MAX_CLIPS;
  const newButton = canNew ? (
    <button
      type="button"
      className={cx(PILL_CLASS, PILL_COMPACT_CLASS)}
      disabled={overNew >= 0}
      title={overNew >= 0 ? `Overlaps clip ${overNew + 1}` : undefined}
      onClick={() => onAdd(span)}
    >
      New clip from these words
    </button>
  ) : null;
  return (
    <>
      {range}
      {result.otherWords > 0 ? (
        <Note>
          An exchange clip: it&apos;s {nameOf(result.speaker)}&apos;s, who says the most words, and also plays{' '}
          {result.otherWords} {result.otherWords === 1 ? 'word' : 'words'} of {nameOf(other)}&apos;s.
        </Note>
      ) : null}
      {readOnly ? null : (
        <span className="flex flex-wrap gap-1.5">
          {selected >= 0 && clips[selected] ? (
            <button
              type="button"
              className={cx(PILL_CLASS, PILL_COMPACT_CLASS)}
              disabled={overSet >= 0}
              title={overSet >= 0 ? `Overlaps clip ${overSet + 1}` : undefined}
              onClick={() => onSet(span)}
            >
              Set clip {selected + 1} to these words
            </button>
          ) : null}
          {newButton && clips.length >= 4 && overNew < 0 ? (
            <Tooltip label={EXTRA_CLIP_TOOLTIP} trigger={newButton} />
          ) : (
            newButton
          )}
        </span>
      )}
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-1.5">
      <WarnIcon size={14} className="mt-0.5 text-grey-04" />
      <span className="text-[14px] leading-[18px] tracking-[-0.1px] text-text">{children}</span>
    </span>
  );
}
