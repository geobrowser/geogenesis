import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  playback: {
    data: undefined as { url: string; thumbnail_url?: string | null } | undefined,
    dataUpdatedAt: 0,
    isError: false,
    refetch: vi.fn(),
  },
  attached: [] as {
    url: string;
    autoStartLoad?: boolean;
    playOnAttach?: boolean;
    onFatalError?: () => void;
    destroy: ReturnType<typeof vi.fn>;
  }[],
  enabled: [] as boolean[],
}));

vi.mock('./hooks', () => ({
  useCallRecordingPlayback: (_callId: string, enabled: boolean) => {
    mocks.enabled.push(enabled);
    return mocks.playback;
  },
}));
vi.mock('~/core/debates/stream-playback', () => ({
  attachStreamSource: (
    _video: HTMLVideoElement,
    url: string,
    options: { autoStartLoad?: boolean; playOnAttach?: boolean; onFatalError?: () => void }
  ) => {
    const entry = { url, ...options, destroy: vi.fn() };
    mocks.attached.push(entry);
    return { startLoad: vi.fn(), destroy: entry.destroy };
  },
}));

const { CallRecordingPlayer, CALL_RECORDING_PLAYER_COPY: COPY } = await import('./call-recording-player');

// Fetches land after the failure that asked for them, as they do for real.
let clock = 1_000;
vi.spyOn(Date, 'now').mockImplementation(() => clock);
function tick() {
  clock += 1_000;
  return clock;
}

afterEach(() => {
  cleanup();
  mocks.playback = { data: undefined, dataUpdatedAt: 0, isError: false, refetch: vi.fn() };
  mocks.attached = [];
  mocks.enabled = [];
  vi.restoreAllMocks();
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
});

describe('CallRecordingPlayer', () => {
  it('is one native-controls element, inline, that never preloads more than metadata', () => {
    mocks.playback = { ...mocks.playback, data: { url: 'https://s/a.m3u8' }, dataUpdatedAt: tick() };
    render(<CallRecordingPlayer callId="call1" preload="none" />);
    const video = screen.getByTestId('call-recording-video') as HTMLVideoElement;
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('preload', 'none');
    expect(mocks.attached.map(a => a.url)).toEqual(['https://s/a.m3u8']);
  });

  it('uses the signed thumbnail as the poster unless given one', () => {
    mocks.playback = {
      ...mocks.playback,
      data: { url: 'https://s/a.m3u8', thumbnail_url: 'https://s/thumb.jpg' },
      dataUpdatedAt: tick(),
    };
    const { rerender } = render(<CallRecordingPlayer callId="call1" />);
    expect(screen.getByTestId('call-recording-video')).toHaveAttribute('poster', 'https://s/thumb.jpg');
    rerender(<CallRecordingPlayer callId="call1" poster="https://s/own.jpg" />);
    expect(screen.getByTestId('call-recording-video')).toHaveAttribute('poster', 'https://s/own.jpg');
  });

  it('keeps the attached source when a background re-sign brings a new URL', () => {
    mocks.playback = { ...mocks.playback, data: { url: 'https://s/a.m3u8' }, dataUpdatedAt: tick() };
    const { rerender } = render(<CallRecordingPlayer callId="call1" />);
    mocks.playback = { ...mocks.playback, data: { url: 'https://s/b.m3u8' }, dataUpdatedAt: tick() };
    rerender(<CallRecordingPlayer callId="call1" />);
    expect(mocks.attached.map(a => a.url)).toEqual(['https://s/a.m3u8']);
  });

  it('re-signs after a failure and attaches the fresh URL', () => {
    mocks.playback = { ...mocks.playback, data: { url: 'https://s/a.m3u8' }, dataUpdatedAt: tick() };
    const { rerender } = render(<CallRecordingPlayer callId="call1" />);
    act(() => mocks.attached[0]!.onFatalError?.());
    expect(mocks.playback.refetch).toHaveBeenCalled();
    expect(mocks.attached[0]!.destroy).toHaveBeenCalled();
    mocks.playback = { ...mocks.playback, data: { url: 'https://s/b.m3u8' }, dataUpdatedAt: tick() };
    rerender(<CallRecordingPlayer callId="call1" />);
    expect(mocks.attached.map(a => a.url)).toEqual(['https://s/a.m3u8', 'https://s/b.m3u8']);
  });

  it('gives up after repeated failures and offers to try again', () => {
    mocks.playback = { ...mocks.playback, data: { url: 'https://s/0.m3u8' }, dataUpdatedAt: tick() };
    const { rerender } = render(<CallRecordingPlayer callId="call1" />);
    for (let i = 1; i <= 3; i += 1) {
      act(() => mocks.attached.at(-1)!.onFatalError?.());
      mocks.playback = { ...mocks.playback, data: { url: `https://s/${i}.m3u8` }, dataUpdatedAt: tick() };
      rerender(<CallRecordingPlayer callId="call1" />);
    }
    expect(screen.getByText(COPY.failed)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.retry })).toBeInTheDocument();
    expect(mocks.attached).toHaveLength(3);
  });

  it('says it cannot play when the URL cannot be signed', () => {
    mocks.playback = { ...mocks.playback, isError: true };
    render(<CallRecordingPlayer callId="call1" />);
    expect(screen.getByText(COPY.failed)).toBeInTheDocument();
  });

  describe('signing on play', () => {
    it('signs nothing and shows a play button until tapped', () => {
      render(<CallRecordingPlayer callId="call1" signOnPlay poster="https://t/p.jpg" />);
      expect(mocks.enabled.every(enabled => !enabled)).toBe(true);
      expect(mocks.attached).toHaveLength(0);
      const video = screen.getByTestId('call-recording-video');
      expect(video).not.toHaveAttribute('controls');
      expect(video).toHaveAttribute('poster', 'https://t/p.jpg');
      expect(screen.queryByText(COPY.loading)).toBeNull();
    });

    it('calls play inside the tap, then signs and attaches loading, playing once attached', () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      const { rerender } = render(<CallRecordingPlayer callId="call1" signOnPlay />);
      fireEvent.click(screen.getByRole('button', { name: COPY.play }));
      expect(play).toHaveBeenCalledTimes(1);
      expect(mocks.enabled.at(-1)).toBe(true);
      expect(screen.getByTestId('call-recording-video')).toHaveAttribute('controls');

      mocks.playback = { ...mocks.playback, data: { url: 'https://s/a.m3u8' }, dataUpdatedAt: tick() };
      rerender(<CallRecordingPlayer callId="call1" signOnPlay />);
      expect(mocks.attached).toMatchObject([{ url: 'https://s/a.m3u8', autoStartLoad: true, playOnAttach: true }]);
      // The second play is the attach's own, after hls.js has taken the element.
      expect(play).toHaveBeenCalledTimes(1);
    });
  });
});
