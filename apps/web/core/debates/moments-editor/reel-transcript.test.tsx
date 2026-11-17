import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EditorClip, ReelSentence, ReelWord } from './reel';
import {
  NO_TRANSCRIPT_ACTIONS,
  ReelTranscript,
  type TranscriptActions,
  edgeBounds,
  movedEdge,
  overlappedClip,
  searchHits,
  toolbarTop,
  transcriptRenderCount,
  transcriptTurns,
  turnRenderCount,
  wordAt,
  wordsBySentence,
} from './reel-transcript';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const word = (slot: 1 | 2, start: number, end: number, text: string): ReelWord => ({
  slot,
  start_ms: start,
  end_ms: end,
  text,
});
const clip = (key: string, start: number, end: number): EditorClip => ({
  key,
  start_ms: start,
  end_ms: end,
  claim_index: null,
  live_claim_text: null,
});

/**
 * A long debate: `turns` turns of `perTurn` words, the speakers taking turns, each word 400 ms with
 * 100 ms between, each turn one sentence, 1 s between turns.
 */
function longDebate(turns: number, perTurn: number) {
  const words: ReelWord[] = [];
  const sentences: ReelSentence[] = [];
  let at = 0;
  for (let turn = 0; turn < turns; turn += 1) {
    const slot = ((turn % 2) + 1) as 1 | 2;
    const start = at;
    for (let nth = 0; nth < perTurn; nth += 1) {
      words.push(word(slot, at, at + 400, `${nth === 0 ? '' : ' '}w${turn}x${nth}`));
      at += 500;
    }
    sentences.push({ slot, start_ms: start, end_ms: at - 100, text: `turn ${turn}` });
    at += 1_000;
  }
  return { words, sentences };
}

/** A playhead frame to drive: `tell` is what the editor's rAF loop does each frame. */
function playheadFrame() {
  const listeners = new Set<(ms: number) => void>();
  return {
    subscribe: (listener: (ms: number) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    tell: (ms: number) => listeners.forEach(listener => listener(ms)),
  };
}

type Props = React.ComponentProps<typeof ReelTranscript>;

function setUp(overrides: Partial<Props> & Pick<Props, 'words' | 'sentences'>) {
  const frame = playheadFrame();
  const actions: { current: TranscriptActions } = {
    current: { ...NO_TRANSCRIPT_ACTIONS, changeClip: vi.fn(), seek: vi.fn(), seekWord: vi.fn(), selectClip: vi.fn() },
  };
  const props: Props = {
    wordTiming: true,
    turns: [],
    clips: [],
    speakers: [],
    selected: -1,
    was: null,
    editable: true,
    readOnly: false,
    snap: true,
    names: { 1: 'Ava', 2: 'Dev' },
    subscribe: frame.subscribe,
    actions,
    ...overrides,
  };
  // The editor around it: it re-renders on every playhead report and every edit elsewhere.
  function Editor({ tick, ...props }: Props & { tick: number }) {
    return (
      <div data-tick={tick}>
        <ReelTranscript {...props} />
      </div>
    );
  }
  const view = render(<Editor {...props} tick={0} />);
  return {
    frame,
    actions,
    props,
    rerender: (next: Partial<Props>, tick = 0) => view.rerender(<Editor {...props} {...next} tick={tick} />),
    transcriptRenders: transcriptRenderCount,
    root: () => screen.getByTestId('reel-transcript'),
    span: (index: number) =>
      screen.getByTestId('reel-transcript').querySelector<HTMLElement>(`[data-word="${index}"]`)!,
  };
}

describe('the side transcript on a long debate (GEO-3773)', () => {
  // 1,500 turns of 10 words: 15,000 words, a 90-minute debate's worth.
  const { words, sentences } = longDebate(1_500, 10);
  const clips = [clip('a', 50_000, 52_400), clip('b', 2_000_000, 2_004_400)];
  const speakers = [1, 2] as const;

  it('renders the whole debate, every word once', () => {
    const view = setUp({ words, sentences, clips, speakers: [...speakers], selected: 0 });
    expect(view.root().querySelectorAll('[data-word]')).toHaveLength(15_000);
    expect(view.root().querySelectorAll('.grid')).toHaveLength(1_500);
  });

  it('does not render on an editor render that changes nothing it shows, or on playhead frames', () => {
    const view = setUp({ words, sentences, clips, speakers: [...speakers], selected: 0 });
    const outer = view.transcriptRenders();
    const turns = turnRenderCount();
    // The editor re-renders (a playhead report, its own state) with the same data.
    for (let tick = 1; tick <= 20; tick += 1) view.rerender({}, tick);
    // A minute of playhead frames. Each word they reach is looked up in its own turn: a search of
    // all 15,000 words at every word is what made this slow.
    const wholeSearch = vi.spyOn(view.root(), 'querySelector');
    act(() => {
      for (let frame = 0; frame < 3_600; frame += 1) view.frame.tell(frame * 16);
    });
    expect(view.transcriptRenders()).toBe(outer);
    expect(turnRenderCount()).toBe(turns);
    expect(wholeSearch).not.toHaveBeenCalled();
    wholeSearch.mockRestore();
    expect(view.root().querySelector('[data-playhead]')).toBe(view.span(wordAt(words, 3_599 * 16)));
  });

  it('underlines the playhead’s word from the frame, one word at a time', () => {
    const view = setUp({ words, sentences, clips, speakers: [...speakers], selected: 0 });
    act(() => view.frame.tell(1_200));
    // 1.2 s: word 2 runs 1.0 to 1.4 s.
    expect(view.span(2)).toHaveAttribute('data-playhead');
    act(() => view.frame.tell(51_000));
    expect(view.span(2)).not.toHaveAttribute('data-playhead');
    expect(view.root().querySelectorAll('[data-playhead]')).toHaveLength(1);
    const at = view.root().querySelector('[data-playhead]') as HTMLElement;
    expect(words[Number(at.dataset.word)].end_ms).toBeGreaterThanOrEqual(51_000);
  });

  it('keeps the playhead’s mark through a render of the word', () => {
    const view = setUp({ words, sentences, clips, speakers: [...speakers], selected: 0 });
    act(() => view.frame.tell(50_100));
    const marked = view.root().querySelector('[data-playhead]') as HTMLElement;
    // Its clip's edge moves: the turn re-renders.
    view.rerender({ clips: [clip('a', 50_000, 53_400), clips[1]] });
    expect(marked).toHaveAttribute('data-playhead');
    // Its turn is drawn anew (a transcript read again): the new word is marked, paused, with no frame.
    const turn = sentences.findIndex(sentence => sentence.end_ms >= 50_100);
    view.rerender({
      sentences: sentences.map((sentence, at) =>
        at === turn ? { ...sentence, start_ms: sentence.start_ms - 1 } : sentence
      ),
    });
    expect(marked.isConnected).toBe(false);
    expect(view.root().querySelector('[data-playhead]')).toBe(view.span(Number(marked.dataset.word)));
  });

  it('outlines what the selected clip played before, and redraws when only that changes', () => {
    const view = setUp({ words, sentences, clips, speakers: [...speakers], selected: 0 });
    // Clip 1 plays words 84 to 88; it used to play 82 to 88.
    expect(view.root().querySelector('.outline-dashed')).toBeNull();
    view.rerender({ was: { start_ms: 49_000, end_ms: 52_400 } });
    expect(view.span(82)).toHaveClass('outline-dashed');
    expect(view.span(84)).not.toHaveClass('outline-dashed');
    // Published as it is now: nothing to outline.
    view.rerender({ was: null });
    expect(view.root().querySelector('.outline-dashed')).toBeNull();
  });

  it('redraws only the turns an edge move touches', () => {
    const view = setUp({ words, sentences, clips, speakers: [...speakers], selected: 0 });
    const before = turnRenderCount();
    // A drag of clip 1's end by one word, as each pointer move sends.
    view.rerender({ clips: [clip('a', 50_000, 52_900), clips[1]] });
    expect(turnRenderCount() - before).toBeLessThanOrEqual(2);
  });

  it('redraws only the turns a search highlights', () => {
    setUp({ words, sentences, clips, speakers: [...speakers], selected: 0 });
    const before = turnRenderCount();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the transcript' }), {
      target: { value: 'w1234x5' },
    });
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    expect(turnRenderCount() - before).toBe(1);
  });

  it('follows the playhead only while playing, when its word leaves the box', () => {
    const view = setUp({ words, sentences, clips, speakers: [...speakers], selected: 0 });
    let playing = false;
    view.actions.current.playing = () => playing;
    const root = view.root();
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 360, 600));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === root) return new DOMRect(0, 0, 360, 600);
      // Every word below the box.
      return new DOMRect(0, 900, 40, 24);
    });
    root.scrollTop = 0;
    act(() => view.frame.tell(300_000));
    expect(root.scrollTop).toBe(0);
    playing = true;
    act(() => view.frame.tell(400_000));
    // 900 - 0 - 600 × 0.25.
    expect(root.scrollTop).toBe(750);
  });
});

describe('the side transcript without word timings (GEO-3642)', () => {
  it('shows a long clip’s number once, before its first sentence, and tints every sentence it plays', () => {
    // Only sentences, each about 5 s: a 28 s clip reaches into six of them.
    const { sentences } = longDebate(12, 10);
    const clips = [clip('a', 10_000, 38_000)];
    const view = setUp({ words: [], sentences, wordTiming: false, clips, speakers: [1], selected: -1 });
    const badges = view.root().querySelectorAll<HTMLElement>('[data-clip]');
    expect(badges).toHaveLength(1);
    const spans = [...view.root().querySelectorAll<HTMLElement>('[data-sentence]')];
    const inClip = spans.filter(span => span.classList.contains('bg-purple/10'));
    expect(inClip.map(span => span.dataset.sentence)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(badges[0].nextElementSibling).toBe(inClip[0]);
    expect(spans.filter(span => span.classList.contains('bg-pink/10'))).toHaveLength(0);
    fireEvent.click(badges[0]);
    expect(view.actions.current.selectClip).toHaveBeenCalledWith('a');
  });

  it('leaves a word-timed transcript’s sentence with no words untinted, numbered after it', () => {
    // Word timings, but debater 2's sentence has no words to show: it is marked as before this
    // fallback, while the clip's own number stays on its first word.
    const words = [word(1, 1_000, 1_400, 'Fix'), word(1, 1_500, 2_400, ' buses.')];
    const sentences: ReelSentence[] = [
      { slot: 1, start_ms: 1_000, end_ms: 2_400, text: 'Fix buses.' },
      { slot: 2, start_ms: 3_000, end_ms: 8_000, text: 'No they should not.' },
    ];
    const clips = [clip('a', 1_000, 7_000)];
    const view = setUp({ words, sentences, clips, speakers: [1], selected: 0 });
    const badges = [...view.root().querySelectorAll<HTMLElement>('[data-clip]')];
    expect(badges).toHaveLength(2);
    expect(badges[0].nextElementSibling).toBe(view.span(0));
    const sentence = view.root().querySelector<HTMLElement>('[data-sentence="1"]')!;
    expect(badges[1].previousElementSibling).toBe(sentence);
    expect(sentence.className).not.toMatch(/bg-/);
    expect(view.span(0)).toHaveClass('bg-purple/10');
  });
});

describe('transcript search (GEO-3773)', () => {
  const words = [
    word(1, 0, 400, 'Then'),
    word(1, 500, 900, ' fix'),
    word(1, 1_000, 1_400, ' the'),
    word(1, 1_500, 1_900, ' night'),
    word(1, 2_000, 2_400, ' buses.'),
    word(2, 10_000, 10_400, 'Night'),
    word(2, 10_500, 10_900, ' buses'),
    word(2, 11_000, 11_400, ' nightly.'),
  ];
  const sentences: ReelSentence[] = [
    { slot: 1, start_ms: 0, end_ms: 2_400, text: 'Then fix the night buses.' },
    { slot: 2, start_ms: 10_000, end_ms: 11_400, text: 'Night buses nightly.' },
  ];

  it('finds words from their start, across words, and inside one word', () => {
    expect(searchHits(words, 'night buses')).toEqual([
      [3, 4],
      [5, 6],
    ]);
    expect(searchHits(words, 'ight')).toEqual([
      [3, 3],
      [5, 5],
      [7, 7],
    ]);
    expect(searchHits(words, '  ')).toEqual([]);
  });

  it('counts hits, cycles them with Enter and Shift+Enter, and says when there are none', () => {
    const view = setUp({ words, sentences });
    const box = screen.getByRole('searchbox', { name: 'Search the transcript' });
    const scrolled = vi.spyOn(view.span(5), 'getBoundingClientRect');
    fireEvent.change(box, { target: { value: 'night buses' } });
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(view.span(3)).toHaveClass('!bg-ctaPrimary/15');
    expect(view.span(4)).toHaveClass('!bg-ctaPrimary/15');
    expect(view.span(2)).not.toHaveClass('!bg-ctaPrimary/15');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(scrolled).toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    // Back from the first hit to the last.
    fireEvent.change(box, { target: { value: 'ight' } });
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'trams' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: '' } });
    expect(screen.queryByText('No matches')).not.toBeInTheDocument();
  });

  it('keeps the transcript where it is while a search is typed on to no matches', () => {
    // Typing on from a hit goes through a space ("night buses ") before the next word: the same
    // search, so it must not go back to the first hit (the top), and "No matches" must not move.
    setUp({ words, sentences });
    const box = screen.getByRole('searchbox', { name: 'Search the transcript' });
    const root = screen.getByTestId('reel-transcript');
    let top = 0;
    const writes: number[] = [];
    Object.defineProperty(root, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        writes.push(value);
        top = value;
      },
    });
    fireEvent.change(box, { target: { value: 'night buses' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    top = 640;
    writes.length = 0;

    fireEvent.change(box, { target: { value: 'night buses ' } });
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'night buses z' } });
    expect(screen.getByText('No matches')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'night buses zq' } });
    expect(writes).toEqual([]);
    expect(top).toBe(640);
  });
});

describe('transcript turns (GEO-3773)', () => {
  it('starts a turn where the speaker changes or after a pause over 6 s', () => {
    const sentences: ReelSentence[] = [
      { slot: 1, start_ms: 0, end_ms: 1_000, text: 'a' },
      { slot: 1, start_ms: 6_900, end_ms: 8_000, text: 'b' },
      { slot: 1, start_ms: 14_100, end_ms: 15_000, text: 'c' },
      { slot: 2, start_ms: 15_100, end_ms: 16_000, text: 'd' },
    ];
    const words = [word(1, 0, 900, 'a'), word(1, 6_900, 7_900, 'b'), word(1, 14_100, 14_900, 'c')];
    const turns = transcriptTurns(sentences, wordsBySentence(sentences, words));
    expect(turns.map(turn => [turn.slot, turn.start_ms, turn.items])).toEqual([
      [1, 0, [{ word: 0 }, { word: 1 }]],
      [1, 14_100, [{ word: 2 }]],
      [2, 15_100, [{ sentence: 3 }]],
    ]);
  });

  it('finds the word at the playhead: the first that hasn’t ended', () => {
    const words = [word(1, 0, 400, 'a'), word(1, 500, 900, 'b'), word(1, 1_000, 1_400, 'c')];
    expect(wordAt(words, 0)).toBe(0);
    expect(wordAt(words, 450)).toBe(1);
    expect(wordAt(words, 900)).toBe(1);
    expect(wordAt(words, 5_000)).toBe(2);
  });
});

describe('moving a clip’s edge from the transcript (GEO-3773)', () => {
  const clips = [clip('a', 1_000, 5_000), clip('b', 8_000, 12_000)];
  /** The debate's last word ends here. */
  const END = 20_000;

  it('moves a word edge, keeping the clip a second long and clear of the next clip', () => {
    expect(movedEdge(clips, 0, 'end', 6_000, false, END)).toMatchObject({ start_ms: 1_000, end_ms: 6_000 });
    expect(movedEdge(clips, 0, 'end', 6_000, false, END)).not.toHaveProperty('free_end_ms');
    expect(movedEdge(clips, 0, 'end', 1_500, false, END)).toBeNull();
    expect(movedEdge(clips, 0, 'end', 9_000, false, END)).toBeNull();
    expect(movedEdge(clips, 1, 'start', 4_500, false, END)).toBeNull();
    expect(movedEdge(clips, 1, 'start', 5_000, false, END)).toMatchObject({ start_ms: 5_000 });
    expect(movedEdge(clips, 0, 'start', 1_000, false, END)).toBeNull();
  });

  it('clamps a free placement to what fits and keeps it exactly there', () => {
    expect(movedEdge(clips, 0, 'end', 9_000, true, END)).toMatchObject({ end_ms: 8_000, free_end_ms: 8_000 });
    expect(movedEdge(clips, 0, 'start', 4_800, true, END)).toMatchObject({ start_ms: 4_000, free_start_ms: 4_000 });
  });

  it('keeps the last clip’s end at the debate’s last word, unless it already ends later', () => {
    expect(movedEdge(clips, 1, 'end', 25_000, true, END)).toMatchObject({ end_ms: 20_000, free_end_ms: 20_000 });
    expect(movedEdge(clips, 1, 'end', 25_000, false, END)).toBeNull();
    expect(edgeBounds(clips, 1, 'end', END)).toEqual([9_000, 20_000]);
    expect(edgeBounds(clips, 0, 'end', END)).toEqual([2_000, 8_000]);
    expect(edgeBounds(clips, 1, 'start', END)).toEqual([5_000, 11_000]);
    // A carried clip already past the last word is not pulled back by a step that moves it out.
    expect(movedEdge(clips, 1, 'end', 12_100, true, 10_000)).toBeNull();
    expect(movedEdge(clips, 1, 'end', 11_900, true, 10_000)).toMatchObject({ end_ms: 11_900 });
  });

  it('finds the clip a span would overlap, other than the one it sets', () => {
    expect(overlappedClip(clips, { start_ms: 4_000, end_ms: 9_000 })).toBe(0);
    expect(overlappedClip(clips, { start_ms: 4_000, end_ms: 9_000 }, 0)).toBe(1);
    // Touching at an edge is not overlapping.
    expect(overlappedClip(clips, { start_ms: 5_000, end_ms: 8_000 })).toBe(-1);
  });
});

describe('the selection toolbar’s place (GEO-3773)', () => {
  const panel = { top: 100, height: 600 };
  it('sits under the last word, above the first when there is no room, inside the panel', () => {
    expect(toolbarTop({ top: 180 }, { bottom: 200 }, panel, 120)).toBe(106);
    // Under 640 + 6 the bar would end past 692: above the first word instead.
    expect(toolbarTop({ top: 600 }, { bottom: 640 }, panel, 120)).toBe(374);
    // Neither fits: kept 8 px from the top.
    expect(toolbarTop({ top: 110 }, { bottom: 690 }, panel, 120)).toBe(8);
  });
});
