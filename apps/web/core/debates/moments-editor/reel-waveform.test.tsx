import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateMediaTurnSegment } from '../api';
import { RENDERED_TURN_SEGMENTS } from '../open-rounds-media-fixtures';
import type { EditorClip, ReelWord } from './reel';
import { ReelWaveform, wordLabels } from './reel-waveform';
import type { PeaksView } from './waveform';

const ONE_CLOCK = RENDERED_TURN_SEGMENTS.map(({ source_start_ms: _s, source_end_ms: _e, ...rest }) => rest);

const WORDS: ReelWord[] = [
  { slot: 1, start_ms: 1_000, end_ms: 1_400, text: ' Coffee' },
  { slot: 1, start_ms: 1_500, end_ms: 2_900, text: ' dates' },
  { slot: 2, start_ms: 5_000, end_ms: 5_400, text: ' Dinner' },
];

const clip = (start: number, end: number, extra: Partial<EditorClip> = {}): EditorClip => ({
  key: 'c',
  start_ms: start,
  end_ms: end,
  claim_index: 0,
  live_claim_text: null,
  ...extra,
});

const READY: PeaksView = {
  kind: 'ready',
  peaks: { bucketMs: 10, samples: new Uint8Array(1_000).fill(80), version: 'v1' },
};

/** The panel with the editor's default pad and focus. */
function Panel(
  props: Omit<React.ComponentProps<typeof ReelWaveform>, 'pad' | 'focus'> &
    Partial<Pick<React.ComponentProps<typeof ReelWaveform>, 'pad' | 'focus'>>
) {
  return <ReelWaveform pad={2_000} focus="clip" {...props} />;
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof ReelWaveform>> & { turns?: readonly DebateMediaTurnSegment[] } = {}
) {
  const onChangeClip = vi.fn();
  const onSeek = vi.fn();
  const utils = render(
    <Panel
      view={READY}
      clip={clip(1_000, 2_900)}
      index={0}
      speaker={1}
      played={{ start_ms: 750, end_ms: 3_150 }}
      words={WORDS}
      turns={ONE_CLOCK}
      durationMs={10_000}
      playheadMs={null}
      readOnly={false}
      onChangeClip={onChangeClip}
      onSeek={onSeek}
      {...props}
    />
  );
  // The window is the clip with 2 s either side: 0 to 4.9 s, drawn 4,900 px wide, a ms per px.
  vi.spyOn(screen.getByTestId('waveform-track'), 'getBoundingClientRect').mockReturnValue({
    width: 4_900,
    left: 0,
  } as DOMRect);
  return { ...utils, onChangeClip, onSeek };
}

/** Drags the start handle from 1 s to 1.234 s, in the middle of "Coffee". */
function dragStart() {
  const handle = screen.getByTestId('fine-start-handle');
  fireEvent.pointerDown(handle, { clientX: 1_000, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 1_234, pointerId: 1 });
  fireEvent.pointerUp(handle, { pointerId: 1 });
}

afterEach(cleanup);

describe('ReelWaveform (GEO-3673)', () => {
  it('labels the words in its window, and reads the clip out in hundredths', () => {
    renderPanel({ playheadMs: 2_134 });
    expect(screen.getAllByTestId('waveform-word').map(node => node.textContent)).toEqual(['Coffee', 'dates']);
    expect(screen.getByTestId('waveform-readout')).toHaveTextContent(
      'Start 0:01.00 · End 0:02.90 · Plays 0:00.75 – 0:03.15 · Playhead 0:02.13'
    );
    expect(screen.getByTestId('waveform-played')).toBeInTheDocument();
  });

  it('places a dragged edge exactly where it is let go, to the 10 ms, never snapping to a word', () => {
    const { onChangeClip } = renderPanel();
    expect(screen.queryByRole('switch', { name: 'Snap to words' })).toBeNull();
    dragStart();
    expect(onChangeClip).toHaveBeenLastCalledWith(0, {
      start_ms: 1_230,
      end_ms: 2_900,
      free_start_ms: 1_230,
      claim_index: 0,
    });
  });

  it('seeks the player where the track is clicked', () => {
    const { onSeek } = renderPanel();
    fireEvent.pointerDown(screen.getByTestId('waveform-track'), { clientX: 2_450 });
    expect(onSeek).toHaveBeenCalledWith(2_450);
  });

  it('hatches what the render cut, and nothing on a fixed format', () => {
    const words: ReelWord[] = [{ slot: 1, start_ms: 118_000, end_ms: 119_500, text: 'cut' }];
    renderPanel({ clip: clip(118_000, 119_500), words, turns: RENDERED_TURN_SEGMENTS, durationMs: 300_000 });
    expect(screen.getByTestId('waveform-cut')).toHaveTextContent('Cut in video');
    cleanup();
    renderPanel({ clip: clip(118_000, 119_500), words, turns: ONE_CLOCK, durationMs: 300_000 });
    expect(screen.queryByTestId('waveform-cut')).not.toBeInTheDocument();
  });

  it('works the same without a waveform, saying why there is none', () => {
    const { onChangeClip } = renderPanel({ view: { kind: 'none', message: 'No waveform for this debate.' } });
    expect(screen.getByText('No waveform for this debate.')).toBeInTheDocument();
    dragStart();
    expect(onChangeClip).toHaveBeenCalled();
  });

  it('says nothing while the first read is out', () => {
    renderPanel({ view: { kind: 'loading' } });
    expect(screen.queryByText(/waveform/i)).not.toBeInTheDocument();
  });

  it('has no handles read-only', () => {
    renderPanel({ readOnly: true });
    expect(screen.queryByTestId('fine-start-handle')).not.toBeInTheDocument();
  });

  describe('a handle dragged out of its window', () => {
    /** The panel as the editor holds it: each drag move becomes the clip it draws. */
    function renderLive() {
      const onChangeClip = vi.fn();
      function Live() {
        const [current, setCurrent] = React.useState(clip(1_000, 2_900));
        return (
          <Panel
            focus="clip"
            view={READY}
            clip={current}
            index={0}
            speaker={1}
            played={null}
            words={WORDS}
            turns={ONE_CLOCK}
            durationMs={10_000}
            playheadMs={null}
            readOnly={false}
            onChangeClip={(index, span) => {
              onChangeClip(index, span);
              setCurrent(previous => ({ ...previous, ...span }));
            }}
            onSeek={vi.fn()}
          />
        );
      }
      render(<Live />);
      vi.spyOn(screen.getByTestId('waveform-track'), 'getBoundingClientRect').mockReturnValue({
        width: 4_900,
        left: 0,
      } as DOMRect);
      // The end, from 2.9 s out to 6 s: past the window's 4.9 s, and past the track's right edge.
      fireEvent.pointerDown(screen.getByTestId('fine-end-handle'), { clientX: 2_900, pointerId: 1 });
      fireEvent.pointerMove(screen.getByTestId('waveform-track'), { clientX: 6_000, pointerId: 1 });
      expect(onChangeClip).toHaveBeenLastCalledWith(0, expect.objectContaining({ end_ms: 6_000 }));
      return onChangeClip;
    }

    it('stays, pinned at the window edge, while it is dragged', () => {
      renderLive();
      expect(screen.getByTestId('fine-end-handle')).toHaveStyle({ left: '100%' });
    });

    it('ends its drag when it is let go off the track', () => {
      const onChangeClip = renderLive();
      fireEvent.pointerUp(document.body, { pointerId: 1 });
      onChangeClip.mockClear();
      // Back over the waveform with no button held: the edge must not follow the hover.
      fireEvent.pointerMove(screen.getByTestId('waveform-track'), { clientX: 3_500, pointerId: 1, buttons: 0 });
      expect(onChangeClip).not.toHaveBeenCalled();
    });

    it('ends its drag when the handle loses the pointer capture', () => {
      const onChangeClip = renderLive();
      fireEvent.lostPointerCapture(screen.getByTestId('fine-end-handle'), { pointerId: 1 });
      onChangeClip.mockClear();
      fireEvent.pointerMove(screen.getByTestId('waveform-track'), { clientX: 3_500, pointerId: 1, buttons: 0 });
      expect(onChangeClip).not.toHaveBeenCalled();
    });
  });
});

describe('ReelWaveform zoomed on an edge (GEO-3773)', () => {
  /** The panel as the editor holds it, zoomed on the clip's end at ±1 s: each drag move becomes the
   * clip it draws. The clip is 1-2.9 s, so the window is 1.9-3.9 s, drawn 2,000 px wide (a ms per px). */
  function renderOnEnd() {
    const onChangeClip = vi.fn();
    function Live() {
      const [current, setCurrent] = React.useState(clip(1_000, 2_900));
      return (
        <Panel
          pad={1_000}
          focus="end"
          view={READY}
          clip={current}
          index={0}
          speaker={1}
          played={null}
          words={WORDS}
          turns={ONE_CLOCK}
          durationMs={10_000}
          playheadMs={null}
          readOnly={false}
          onChangeClip={(index, span) => {
            onChangeClip(index, span);
            setCurrent(previous => ({ ...previous, ...span }));
          }}
          onSeek={vi.fn()}
        />
      );
    }
    render(<Live />);
    vi.spyOn(screen.getByTestId('waveform-track'), 'getBoundingClientRect').mockReturnValue({
      width: 2_000,
      left: 0,
    } as DOMRect);
    return onChangeClip;
  }

  it('centres the window on the edge, with the edge handle in its middle and the other out of view', () => {
    renderOnEnd();
    expect(screen.getByTestId('waveform-track')).toHaveAttribute('data-window', '1900-3900');
    expect(screen.getByTestId('fine-end-handle')).toHaveStyle({ left: '50%' });
    expect(screen.queryByTestId('fine-start-handle')).toBeNull();
    // Only "dates" (1.5-2.9 s) reaches into the window.
    expect(screen.getAllByTestId('waveform-word').map(word => word.textContent)).toEqual(['dates']);
  });

  it('maps a drag to the zoomed window’s ms, keeps the window still under it, and centres on the edge when let go', () => {
    const onChangeClip = renderOnEnd();
    const handle = screen.getByTestId('fine-end-handle');
    // The end sits at 1,000 px (2.9 s); 207 px right is 207 ms later: 3.107 s, to the 10 ms.
    fireEvent.pointerDown(handle, { clientX: 1_000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 1_207, pointerId: 1 });
    expect(onChangeClip).toHaveBeenLastCalledWith(0, expect.objectContaining({ start_ms: 1_000, end_ms: 3_110 }));
    // The window has not moved under the pointer: the handle is where the pointer is.
    expect(screen.getByTestId('waveform-track')).toHaveAttribute('data-window', '1900-3900');
    expect(screen.getByTestId('fine-end-handle')).toHaveStyle({ left: '60.5%' });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(screen.getByTestId('waveform-track')).toHaveAttribute('data-window', '2110-4110');
    expect(screen.getByTestId('fine-end-handle')).toHaveStyle({ left: '50%' });
  });

  it('leaves a dragged edge mid-word in the zoomed window: no snapping out to the word', () => {
    const onChangeClip = renderOnEnd();
    const handle = screen.getByTestId('fine-end-handle');
    // From 2.9 s back 600 ms to 2.3 s, mid "dates": it stays there.
    fireEvent.pointerDown(handle, { clientX: 1_000, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
    expect(onChangeClip).toHaveBeenLastCalledWith(0, expect.objectContaining({ end_ms: 2_300, free_end_ms: 2_300 }));
  });

  it('seeks to the ms clicked in the zoomed window', () => {
    const onSeek = vi.fn();
    render(
      <Panel
        pad={1_000}
        focus="start"
        view={READY}
        clip={clip(1_000, 2_900)}
        index={0}
        speaker={1}
        played={null}
        words={WORDS}
        turns={ONE_CLOCK}
        durationMs={10_000}
        playheadMs={1_250}
        readOnly={false}
        onChangeClip={vi.fn()}
        onSeek={onSeek}
      />
    );
    const track = screen.getByTestId('waveform-track');
    // On the start at ±1 s: 0-2 s, drawn 2,000 px wide.
    expect(track).toHaveAttribute('data-window', '0-2000');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ width: 2_000, left: 0 } as DOMRect);
    fireEvent.pointerDown(track, { clientX: 1_500 });
    expect(onSeek).toHaveBeenCalledWith(1_500);
  });
});

describe('wordLabels (the prototype’s label rule)', () => {
  const frame = { start_ms: 0, end_ms: 10_000 };
  const word = (start_ms: number, end_ms: number, text: string) => ({ start_ms, end_ms, text });

  it('labels short words too, centred on them, as long as they don’t run into the last label', () => {
    // 1,000 px for 10 s: 0.1 px per ms. "is" (100 ms, 10 px) is narrower than its label but still drawn.
    const words = [
      word(1_000, 1_100, 'is'),
      word(1_100, 1_150, 'a'),
      word(3_000, 3_400, 'coffee'),
      word(9_000, 9_400, 'date'),
    ];
    expect(wordLabels(words, frame, 1_000).map(w => w.text)).toEqual(['is', 'coffee', 'date']);
  });

  it('skips a word whose label would collide, and one centred out of view', () => {
    const words = [
      word(-400, -100, 'gone'),
      word(2_000, 2_400, 'Saturday'),
      word(2_500, 2_700, 'night'),
      word(4_000, 4_200, 'fun'),
    ];
    // "Saturday" ends at 220 + 26.4 px; "night" would start at 260 - 16.5 = 243.5, under 4 px after it.
    expect(wordLabels(words, frame, 1_000).map(w => w.text)).toEqual(['Saturday', 'fun']);
  });

  it('labels every word while unmeasured', () => {
    const words = [word(1_000, 1_010, 'a'), word(1_010, 1_020, 'b')];
    expect(wordLabels(words, frame, 0)).toHaveLength(2);
  });
});
