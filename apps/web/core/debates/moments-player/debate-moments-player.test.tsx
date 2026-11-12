import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGeoChatApiBaseUrl } from '../geo-chat-public-base-url';
import { type DebateMoment, decodeDebateMoments } from './debate-moments';
import { DebateMomentsPlayer } from './debate-moments-player';

const mocks = vi.hoisted(() => ({
  getDebateExtractedClaims: vi.fn(),
  play: vi.fn(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }),
  pause: vi.fn(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    this.dispatchEvent(new Event('pause'));
  }),
  /** As a browser does: a reload starts the resource over, at 0. Records the src it reloaded with. */
  load: vi.fn(function (this: HTMLMediaElement) {
    if (Object.getOwnPropertyDescriptor(this, 'currentTime')?.writable) this.currentTime = 0;
    return this.getAttribute('src');
  }),
}));

vi.mock('../api', () => ({ getDebateExtractedClaims: mocks.getDebateExtractedClaims }));

const DEBATE = '01a0b080-9a14-7c71-887b-d65ea3df4706';

const payload = {
  // Picked moments: each file was cut 250 ms before its claim's clip (`clip_lead_ms`).
  claims: [0, 1, 2].map(i => ({
    text: ['one', 'two', 'three'][i],
    clip_start_ms: 20_000 + i * 60_000,
    clip_end_ms: 35_000 + i * 60_000,
    clip_lead_ms: 250,
    clip_tail_ms: 250,
  })),
  moments: [0, 1, 2].map(i => ({
    moment_index: i,
    claim_index: i,
    participant_slot: (i % 2) + 1,
    clip_url: `/debates/${DEBATE}/moments/clip-${i}/content`,
    clip_start_ms: 20_000 + i * 60_000,
    clip_end_ms: 35_000 + i * 60_000,
    duration_ms: 15_000,
    subtitles: [{ start_ms: 0, end_ms: 4000, text: `Caption of moment ${i + 1}` }],
  })),
};

const MOMENTS: DebateMoment[] = decodeDebateMoments(payload, 'https://chat.test');

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** The player's one element. */
function videoOf(player: HTMLElement): HTMLVideoElement {
  const video = player.querySelector<HTMLVideoElement>('video');
  if (!video) throw new Error('no video');
  return video;
}

/** Report a length and a position, as the element would while playing. */
function advance(video: HTMLVideoElement, seconds: number, duration = 15) {
  Object.defineProperty(video, 'duration', { configurable: true, value: duration });
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: seconds });
  fireEvent.loadedMetadata(video);
  fireEvent.timeUpdate(video);
}

/** A clip reaching its end, as a browser reports it: paused, `pause`, then `ended`. */
function playToEnd(video: HTMLVideoElement) {
  Object.defineProperty(video, 'paused', { configurable: true, value: true });
  fireEvent.pause(video);
  fireEvent.ended(video);
}

beforeEach(() => {
  mocks.getDebateExtractedClaims.mockReset();
  mocks.play.mockClear();
  mocks.pause.mockClear();
  mocks.load.mockClear();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: mocks.play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: mocks.pause });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: mocks.load });
});

afterEach(cleanup);

describe('DebateMomentsPlayer', () => {
  it('keeps both debaters in full colour, whoever is speaking', () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    const player = screen.getByRole('region', { name: 'Debate A' });
    expect(player.querySelector('[class*="mix-blend"], [class*="808080"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next moment' }));
    expect(player.querySelector('[class*="mix-blend"], [class*="808080"]')).toBeNull();
  });

  it('draws no fill over the picture when a tap zone has focus', () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    for (const name of ['Play', 'Previous moment', 'Next moment']) {
      expect(screen.getByRole('button', { name }).className).not.toMatch(/focus-visible:bg-/);
    }
  });

  it('shows one bar per moment and steps with the left and right edges', () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    const player = screen.getByRole('region', { name: 'Debate A' });

    expect(within(player).getByTestId('moment-segments').children).toHaveLength(3);
    expect(videoOf(player)).toHaveAttribute('src', 'https://chat.test/debates/' + DEBATE + '/moments/clip-0/content');

    fireEvent.click(screen.getByRole('button', { name: 'Next moment' }));
    expect(videoOf(player).getAttribute('src')).toContain('/moments/clip-1/content');
    expect(screen.getByTestId('moment-segment-0')).toHaveStyle({ width: '100%' });
    expect(screen.getByTestId('moment-segment-1')).toHaveStyle({ width: '0%' });

    fireEvent.click(screen.getByRole('button', { name: 'Next moment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next moment' }));
    expect(videoOf(player).getAttribute('src')).toContain('/moments/clip-2/content');

    fireEvent.click(screen.getByRole('button', { name: 'Previous moment' }));
    expect(videoOf(player).getAttribute('src')).toContain('/moments/clip-1/content');
  });

  it('fills the bar and captions the moment as it plays, then plays on into the next', () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    const player = screen.getByRole('region', { name: 'Debate A' });

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    advance(videoOf(player), 3);
    expect(screen.getByTestId('moment-segment-0')).toHaveStyle({ width: '20%' });
    expect(screen.getByText('Caption of moment 1')).toBeInTheDocument();

    // Paused, the caption gives way to the play disc, which sits over the middle of the picture.
    fireEvent.pause(videoOf(player));
    expect(screen.queryByText('Caption of moment 1')).not.toBeInTheDocument();
    expect(screen.getByTestId('play-indicator')).toBeInTheDocument();
    fireEvent.play(videoOf(player));
    expect(screen.getByText('Caption of moment 1')).toBeInTheDocument();
    expect(screen.queryByTestId('play-indicator')).not.toBeInTheDocument();

    advance(videoOf(player), 6);
    expect(screen.queryByText('Caption of moment 1')).not.toBeInTheDocument();

    fireEvent.ended(videoOf(player));
    expect(videoOf(player).getAttribute('src')).toContain('/moments/clip-1/content');
    // Playing on: the next clip was started without another press.
    expect(mocks.play).toHaveBeenCalledTimes(2);
  });

  it('expands to the full debate at the moment on screen, with a dot per moment, and closes back to it', () => {
    const onModeChange = vi.fn();
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} onModeChange={onModeChange} />);
    const player = screen.getByRole('region', { name: 'Debate A' });

    fireEvent.click(screen.getByRole('button', { name: 'Next moment' }));
    advance(videoOf(player), 2);
    fireEvent.click(screen.getByRole('button', { name: 'Watch the full debate' }));

    const full = videoOf(player);
    expect(full).toHaveAttribute(
      'src',
      `${getGeoChatApiBaseUrl()}/debates/${DEBATE}/media/artifacts/final_video/content`
    );
    expect(onModeChange).toHaveBeenLastCalledWith('full');

    // The full video's metadata arrives: it seeks to where moment 2's file starts in the debate
    // (its claim's clip at 80 s, less the 250 ms lead the file was cut with), plus the 2 s watched.
    Object.defineProperty(full, 'duration', { configurable: true, value: 300 });
    Object.defineProperty(full, 'currentTime', { configurable: true, writable: true, value: 0 });
    fireEvent.loadedMetadata(full);
    expect(full.currentTime).toBe(81.75);
    expect(screen.getByTestId('debate-elapsed')).toHaveTextContent('1:21');
    expect(screen.getByTestId('debate-duration')).toHaveTextContent('5:00');
    expect(screen.getAllByRole('button', { name: /^Jump to moment/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Jump to moment 3' }));
    expect(full.currentTime).toBe(139.75);

    fireEvent.click(screen.getByRole('button', { name: 'Back to moments' }));
    expect(onModeChange).toHaveBeenLastCalledWith('moments');
    expect(videoOf(player).getAttribute('src')).toContain('/moments/clip-2/content');
  });

  it('opens a debate without moments straight in the full debate, with nothing to close back to', async () => {
    mocks.getDebateExtractedClaims.mockResolvedValue({ claims: [{ text: 'a' }], turns: [], moments: [] });
    renderWithQuery(<DebateMomentsPlayer debateId={DEBATE} label="Debate B" />);

    await screen.findByLabelText('Debate B: full debate');
    const player = screen.getByRole('region', { name: 'Debate B' });
    expect(videoOf(player).getAttribute('src')).toContain('/media/artifacts/final_video/content');
    expect(screen.queryByRole('button', { name: 'Back to moments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next moment' })).not.toBeInTheDocument();
    // No moments: it just plays the full debate, with no note about it and no moment bars.
    expect(screen.queryByText(/No moments/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('moment-segments')).not.toBeInTheDocument();
    // Read unsigned: the reel is public.
    expect(mocks.getDebateExtractedClaims).toHaveBeenCalledWith(DEBATE, undefined, null, expect.anything());
  });

  it('falls back to the full debate when the moments read fails', async () => {
    mocks.getDebateExtractedClaims.mockRejectedValue(new Error('503'));
    renderWithQuery(<DebateMomentsPlayer debateId={DEBATE} label="Debate B" />);
    expect(await screen.findByLabelText('Debate B: full debate')).toBeInTheDocument();
  });

  it('reads the reel when not given one', async () => {
    mocks.getDebateExtractedClaims.mockResolvedValue(payload);
    renderWithQuery(<DebateMomentsPlayer debateId={DEBATE} label="Debate C" />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByLabelText('Debate C: moment 1 of 3')).toHaveAttribute(
      'src',
      `${getGeoChatApiBaseUrl()}/debates/${DEBATE}/moments/clip-0/content`
    );
  });

  it('pauses the other player when one starts', () => {
    render(
      <>
        <DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />
        <DebateMomentsPlayer debateId="other-debate" label="Debate B" moments={[]} />
      </>
    );
    const a = videoOf(screen.getByRole('region', { name: 'Debate A' }));
    const b = videoOf(screen.getByRole('region', { name: 'Debate B' }));

    fireEvent.click(within(screen.getByRole('region', { name: 'Debate A' })).getByRole('button', { name: 'Play' }));
    expect(mocks.pause.mock.contexts).toContain(b);
    expect(mocks.pause.mock.contexts).not.toContain(a);

    mocks.pause.mockClear();
    act(() => {
      b.dispatchEvent(new Event('play'));
    });
    expect(mocks.pause.mock.contexts).toEqual([a]);
  });
  it('keeps one element for the whole reel, so a tap-granted play carries to the next moment, and fetches nothing ahead', () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    const player = screen.getByRole('region', { name: 'Debate A' });
    const element = videoOf(player);

    // geo-chat signs each clip redirect afresh, so a second element fetching ahead could never
    // share its bytes with this one: one element, and only metadata before a press.
    expect(player.querySelectorAll('video')).toHaveLength(1);
    expect(element).toHaveAttribute('preload', 'metadata');

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.ended(element);
    expect(videoOf(player)).toBe(element);
    expect(element.getAttribute('src')).toContain('/moments/clip-1/content');
    expect(mocks.play.mock.contexts).toEqual([element, element]);
    expect(player.querySelectorAll('video')).toHaveLength(1);

    // The full debate plays in the same element too.
    fireEvent.click(screen.getByRole('button', { name: 'Watch the full debate' }));
    expect(videoOf(player)).toBe(element);
    expect(element.getAttribute('src')).toContain('/media/artifacts/final_video/content');
  });

  it('tells the host once per start the viewer makes, not once per moment it plays on into', () => {
    const onPlay = vi.fn();
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} onPlay={onPlay} />);
    const element = videoOf(screen.getByRole('region', { name: 'Debate A' }));

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    playToEnd(element);
    playToEnd(element);
    fireEvent.click(screen.getByRole('button', { name: 'Watch the full debate' }));
    act(() => {
      element.dispatchEvent(new Event('play'));
    });
    expect(onPlay).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onPlay).toHaveBeenCalledTimes(2);
  });

  it("clears a failed clip's error when the viewer steps on, and leaves the play control up", () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    const player = screen.getByRole('region', { name: 'Debate A' });

    fireEvent.error(videoOf(player));
    expect(screen.getByText('Couldn’t play this moment.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next moment' }));
    expect(screen.queryByText('Couldn’t play this moment.')).not.toBeInTheDocument();
    expect(screen.getByTestId('play-indicator')).toBeInTheDocument();

    fireEvent.error(videoOf(player));
    fireEvent.click(screen.getByRole('button', { name: 'Watch the full debate' }));
    expect(screen.queryByText('Couldn’t play this debate.')).not.toBeInTheDocument();
  });

  it('retries the full debate from where it failed, not from the top', () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate B" moments={[]} />);
    const video = videoOf(screen.getByRole('region', { name: 'Debate B' }));
    Object.defineProperty(video, 'duration', { configurable: true, value: 300 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 0 });
    fireEvent.loadedMetadata(video);
    video.currentTime = 95;
    fireEvent.timeUpdate(video);

    fireEvent.error(video);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.load).toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(95);
    expect(mocks.play.mock.contexts).toContain(video);
  });

  it('keeps the play control down while the reel moves on to a slow next clip, with a quiet loading mark', () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    const element = videoOf(screen.getByRole('region', { name: 'Debate A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    // The next clip has not started yet: its redirect and buffering take a while.
    mocks.play.mockImplementationOnce(function (this: HTMLMediaElement) {
      return new Promise<void>(() => {});
    });
    playToEnd(element);
    expect(screen.queryByTestId('play-indicator')).not.toBeInTheDocument();
    expect(screen.getByTestId('advancing-indicator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    act(() => {
      Object.defineProperty(element, 'paused', { configurable: true, value: false });
      element.dispatchEvent(new Event('play'));
    });
    expect(screen.queryByTestId('advancing-indicator')).not.toBeInTheDocument();
    expect(screen.queryByTestId('play-indicator')).not.toBeInTheDocument();
  });

  it('stops the hand-off when Pause is pressed while the next moment loads', () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    const element = videoOf(screen.getByRole('region', { name: 'Debate A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    mocks.play.mockImplementationOnce(function (this: HTMLMediaElement) {
      return new Promise<void>(() => {});
    });
    playToEnd(element);
    mocks.pause.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(mocks.pause.mock.contexts).toContain(element);
    expect(screen.queryByTestId('advancing-indicator')).not.toBeInTheDocument();
    expect(screen.getByTestId('play-indicator')).toBeInTheDocument();
  });

  it('reports a Retry as a start the viewer made', () => {
    const onPlay = vi.fn();
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} onPlay={onPlay} />);
    fireEvent.error(videoOf(screen.getByRole('region', { name: 'Debate A' })));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('comes back paused when an Activity shows it again, not playing on by itself', () => {
    const view = (mode: 'visible' | 'hidden') => (
      <React.Activity mode={mode}>
        <DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />
      </React.Activity>
    );
    const { rerender } = render(view('visible'));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    rerender(view('hidden'));
    mocks.play.mockClear();

    rerender(view('visible'));
    expect(mocks.play).not.toHaveBeenCalled();
  });

  it('releases its media when it unmounts', () => {
    const { unmount } = render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    const player = screen.getByRole('region', { name: 'Debate A' });
    const element = videoOf(player);

    unmount();
    // `releaseVideo`: paused, src removed, then reloaded empty.
    expect(mocks.pause.mock.contexts).toContain(element);
    expect(mocks.load.mock.contexts).toContain(element);
    expect(element).not.toHaveAttribute('src');
  });

  it('pauses, but keeps its source, when hidden by an Activity that leaves the element in place', () => {
    const view = (mode: 'visible' | 'hidden') => (
      <React.Activity mode={mode}>
        <DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />
      </React.Activity>
    );
    const { rerender, container } = render(view('visible'));
    const element = container.querySelector('video') as HTMLVideoElement;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    mocks.pause.mockClear();

    rerender(view('hidden'));
    expect(element.isConnected).toBe(true);
    expect(mocks.pause.mock.contexts).toContain(element);
    expect(element.getAttribute('src')).toContain('/moments/clip-0/content');
  });

  it("keeps its media through StrictMode's rehearsal unmount", () => {
    render(
      <React.StrictMode>
        <DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />
      </React.StrictMode>
    );
    const player = screen.getByRole('region', { name: 'Debate A' });
    expect(videoOf(player).getAttribute('src')).toContain('/moments/clip-0/content');
  });

  it('keeps the moment dots outside the slider, as labelled buttons, and seeks with Home and End', () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Watch the full debate' }));
    const video = videoOf(screen.getByRole('region', { name: 'Debate A' }));
    Object.defineProperty(video, 'duration', { configurable: true, value: 300 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 0 });
    fireEvent.loadedMetadata(video);

    const slider = screen.getByRole('slider', { name: 'Debate position' });
    const dots = screen.getAllByRole('button', { name: /^Jump to moment/ });
    expect(dots).toHaveLength(3);
    for (const dot of dots) {
      expect(slider).not.toContainElement(dot);
      expect(dot).toHaveClass('size-6');
    }

    fireEvent.keyDown(slider, { key: 'End' });
    expect(video.currentTime).toBe(300);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(video.currentTime).toBe(0);
  });

  it('moves focus to the control that replaces expand or close, never to the page', () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    const expand = screen.getByRole('button', { name: 'Watch the full debate' });
    expand.focus();
    fireEvent.click(expand);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to moments' }));

    fireEvent.click(screen.getByRole('button', { name: 'Back to moments' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Watch the full debate' }));
  });
});
