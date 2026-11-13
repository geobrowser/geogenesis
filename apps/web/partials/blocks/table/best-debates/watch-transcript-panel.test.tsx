import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WatchBlock } from '~/core/debates/moments-player/watch-transcript';

import { READING_HOLD_MS, type WatchMomentNav, WatchTranscriptPanel } from './watch-transcript-panel';

const BLOCK: WatchBlock = {
  key: 'm0',
  slot: 1,
  momentIndex: 0,
  debateStartMs: 0,
  lines: Array.from({ length: 10 }, (_, i) => ({ key: `m0:${i}`, startMs: i * 1_000, text: `Line ${i}` })),
};

function Panel({ highlightKey, momentNav }: { highlightKey: string | null; momentNav?: WatchMomentNav }) {
  return (
    <WatchTranscriptPanel
      view="moments"
      momentsOffered
      onViewChange={() => undefined}
      speed="1"
      onSpeedChange={() => undefined}
      content={{ status: 'ready', blocks: [BLOCK] }}
      highlightKey={highlightKey}
      showTurnTimes={false}
      speakerOf={() => ({ name: 'Maya Chen', side: 'Agree', avatarUrl: null, avatarSeed: 'm' })}
      momentNav={momentNav}
      onLine={() => undefined}
    />
  );
}

/** Lays the lines out as a browser would: 40px each, in a 100px-tall scroller. */
function layOut() {
  const scroller = screen.getByTestId('watch-transcript-lines');
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 100 });
  Object.defineProperty(scroller, 'scrollTop', { configurable: true, writable: true, value: 0 });
  BLOCK.lines.forEach((line, i) => {
    const button = screen.getByRole('button', { name: line.text });
    Object.defineProperty(button, 'offsetTop', { configurable: true, value: 40 + i * 40 });
    Object.defineProperty(button, 'offsetHeight', { configurable: true, value: 40 });
  });
  return scroller;
}

let now = 1_000_000;

beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const nav = (index: number): WatchMomentNav => ({ index, count: 3, onStep: () => undefined });

describe('WatchTranscriptPanel', () => {
  it('brings the spoken line into view, and leaves it where it is when it is already in view', () => {
    const { rerender } = render(<Panel highlightKey={null} momentNav={nav(0)} />);
    const scroller = layOut();
    rerender(<Panel highlightKey="m0:0" momentNav={nav(0)} />);
    expect(scroller.scrollTop).toBe(0);
    rerender(<Panel highlightKey="m0:6" momentNav={nav(0)} />);
    // Line 6 sits at 280px: brought to a third of the way down.
    expect(scroller.scrollTop).toBeCloseTo(280 - 100 / 3);
  });

  it('stops following for a while after the ranker scrolls the lines', () => {
    const { rerender } = render(<Panel highlightKey={null} momentNav={nav(0)} />);
    const scroller = layOut();
    fireEvent.wheel(scroller);
    rerender(<Panel highlightKey="m0:6" momentNav={nav(0)} />);
    expect(scroller.scrollTop).toBe(0);
    now += READING_HOLD_MS + 1;
    rerender(<Panel highlightKey="m0:7" momentNav={nav(0)} />);
    expect(scroller.scrollTop).toBeCloseTo(320 - 100 / 3);
  });

  it.each([
    ['a trackpad scroll', (target: Element) => fireEvent.wheel(target)],
    ['a finger drag', (target: Element) => fireEvent.touchMove(target)],
  ])('counts %s over the text as reading', (_, scroll) => {
    const { rerender } = render(<Panel highlightKey={null} momentNav={nav(0)} />);
    const scroller = layOut();
    scroll(screen.getByRole('button', { name: 'Line 2' }));
    rerender(<Panel highlightKey="m0:6" momentNav={nav(0)} />);
    expect(scroller.scrollTop).toBe(0);
  });

  it('keeps following after the ranker presses a line', () => {
    const { rerender } = render(<Panel highlightKey={null} momentNav={nav(0)} />);
    const scroller = layOut();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Line 6' }));
    rerender(<Panel highlightKey="m0:6" momentNav={nav(0)} />);
    expect(scroller.scrollTop).toBeCloseTo(280 - 100 / 3);
  });

  it('starts a new moment’s lines from the top', () => {
    const { rerender } = render(<Panel highlightKey={null} momentNav={nav(0)} />);
    const scroller = layOut();
    scroller.scrollTop = 200;
    rerender(<Panel highlightKey={null} momentNav={nav(1)} />);
    expect(scroller.scrollTop).toBe(0);
  });

  it('says when the moment on screen has no transcript, keeping its step', () => {
    render(
      <WatchTranscriptPanel
        view="moments"
        momentsOffered
        onViewChange={() => undefined}
        speed="1"
        onSpeedChange={() => undefined}
        content={{ status: 'ready', blocks: [{ ...BLOCK, lines: [] }] }}
        highlightKey={null}
        showTurnTimes={false}
        speakerOf={() => ({ name: 'Maya Chen', side: 'Agree', avatarUrl: null, avatarSeed: 'm' })}
        momentNav={nav(0)}
        onLine={() => undefined}
      />
    );
    expect(screen.getByText('No transcript for this moment.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next moment' })).toBeInTheDocument();
  });

  // GEO-3728, Preston 13 Nov: cues flow as one paragraph of text, not a box each.
  it('flows the lines as text in one paragraph, one tab stop, the arrow keys moving between them', () => {
    const onLine = vi.fn();
    render(
      <WatchTranscriptPanel
        view="moments"
        momentsOffered
        onViewChange={() => undefined}
        speed="1"
        onSpeedChange={() => undefined}
        content={{ status: 'ready', blocks: [BLOCK] }}
        highlightKey="m0:2"
        showTurnTimes={false}
        speakerOf={() => ({ name: 'Maya Chen', side: 'Agree', avatarUrl: null, avatarSeed: 'm' })}
        onLine={onLine}
      />
    );
    const lines = BLOCK.lines.map(line => screen.getByRole('button', { name: line.text }));
    expect(lines.every(line => line.tagName === 'SPAN')).toBe(true);
    expect(new Set(lines.map(line => line.parentElement)).size).toBe(1);
    expect(lines.filter(line => line.tabIndex === 0)).toEqual([lines[2]]);

    lines[2].focus();
    fireEvent.keyDown(lines[2], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(lines[3]);
    fireEvent.keyDown(lines[3], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(lines[2]);
    fireEvent.keyDown(lines[2], { key: 'Enter' });
    expect(onLine).toHaveBeenCalledWith(BLOCK, BLOCK.lines[2]);
    fireEvent.click(lines[5]);
    expect(onLine).toHaveBeenLastCalledWith(BLOCK, BLOCK.lines[5]);
  });

  it('reads ahead with the arrow keys: the lines scroll to the one focused and stop following the video', () => {
    const { rerender } = render(<Panel highlightKey="m0:0" momentNav={nav(0)} />);
    const scroller = layOut();
    const line = (i: number) => screen.getByRole('button', { name: `Line ${i}` });
    line(0).focus();
    for (let i = 0; i < 4; i++) fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(line(4));
    // Line 4 ends at 240px in a 100px panel: scrolled just enough to show it.
    expect(scroller.scrollTop).toBe(140);
    rerender(<Panel highlightKey="m0:1" momentNav={nav(0)} />);
    expect(scroller.scrollTop).toBe(140);
  });

  it('moves the one tab stop with the arrow keys, and gives it back to the spoken line on leaving', () => {
    render(<Panel highlightKey="m0:5" momentNav={nav(0)} />);
    const line = (i: number) => screen.getByRole('button', { name: `Line ${i}` });
    const tabStops = () => BLOCK.lines.filter((_, i) => line(i).tabIndex === 0).map(l => l.text);
    expect(tabStops()).toEqual(['Line 5']);
    line(5).focus();
    fireEvent.keyDown(line(5), { key: 'ArrowLeft' });
    fireEvent.keyDown(line(4), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(line(3));
    expect(tabStops()).toEqual(['Line 3']);
    act(() => line(3).blur());
    expect(tabStops()).toEqual(['Line 5']);
  });
});
