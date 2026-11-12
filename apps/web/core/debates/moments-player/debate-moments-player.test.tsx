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
}));

vi.mock('../api', () => ({ getDebateExtractedClaims: mocks.getDebateExtractedClaims }));

const DEBATE = '01a0b080-9a14-7c71-887b-d65ea3df4706';

const payload = {
  claims: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
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

function videoOf(player: HTMLElement): HTMLVideoElement {
  const video = player.querySelector('video');
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
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: mocks.play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: mocks.pause });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() });
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

    // The full video's metadata arrives: it seeks to moment 2's start plus the 2 s watched.
    Object.defineProperty(full, 'readyState', { configurable: true, value: 1 });
    Object.defineProperty(full, 'duration', { configurable: true, value: 300 });
    Object.defineProperty(full, 'currentTime', { configurable: true, writable: true, value: 0 });
    fireEvent.loadedMetadata(full);
    expect(full.currentTime).toBe(82);
    expect(screen.getByText('1:22 / 5:00')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Jump to moment/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Jump to moment 3' }));
    expect(full.currentTime).toBe(140);

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
});
