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
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }),
  pause: vi.fn(function (this: HTMLMediaElement) {
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

/** The player's visible element; the next clip's preload is a second, hidden one. */
function videoOf(player: HTMLElement): HTMLVideoElement {
  const video = player.querySelector<HTMLVideoElement>('video:not([data-preload])');
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
    expect(screen.getByText('1:21 / 5:00')).toBeInTheDocument();
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
    expect(screen.getByText('No moments for this debate yet')).toBeInTheDocument();
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
  it('keeps one element for the whole reel, so a tap-granted play carries to the next moment, and preloads the next clip', () => {
    render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    const player = screen.getByRole('region', { name: 'Debate A' });
    const element = videoOf(player);
    const preload = () => player.querySelector('video[data-preload]');

    expect(preload()).toHaveAttribute('src', expect.stringContaining('/moments/clip-1/content'));
    expect(preload()).toHaveAttribute('preload', 'auto');

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.ended(element);
    expect(videoOf(player)).toBe(element);
    expect(element.getAttribute('src')).toContain('/moments/clip-1/content');
    expect(mocks.play.mock.contexts).toEqual([element, element]);
    expect(preload()).toHaveAttribute('src', expect.stringContaining('/moments/clip-2/content'));

    // The full debate plays in the same element too.
    fireEvent.click(screen.getByRole('button', { name: 'Watch the full debate' }));
    expect(videoOf(player)).toBe(element);
    expect(element.getAttribute('src')).toContain('/media/artifacts/final_video/content');
    expect(preload()).toBeNull();
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

  it('releases its media when it unmounts', () => {
    const { unmount } = render(<DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />);
    const player = screen.getByRole('region', { name: 'Debate A' });
    const element = videoOf(player);
    const preload = player.querySelector('video[data-preload]') as HTMLVideoElement;

    unmount();
    // `releaseVideo`: paused, src removed, then reloaded empty.
    expect(mocks.pause.mock.contexts).toContain(element);
    expect(mocks.load.mock.contexts).toEqual(expect.arrayContaining([element, preload]));
    expect(element).not.toHaveAttribute('src');
    expect(preload).not.toHaveAttribute('src');
  });

  it("keeps its media through StrictMode's rehearsal unmount", () => {
    render(
      <React.StrictMode>
        <DebateMomentsPlayer debateId={DEBATE} label="Debate A" moments={MOMENTS} />
      </React.StrictMode>
    );
    const player = screen.getByRole('region', { name: 'Debate A' });
    expect(videoOf(player).getAttribute('src')).toContain('/moments/clip-0/content');
    expect(player.querySelector('video[data-preload]')?.getAttribute('src')).toContain('/moments/clip-1/content');
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
