import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  playback: {
    data: undefined as { url: string } | undefined,
    dataUpdatedAt: 0,
    isError: false,
    refetch: vi.fn(),
  },
  attached: [] as { url: string; onFatalError?: () => void; destroy: ReturnType<typeof vi.fn> }[],
}));

vi.mock('./hooks', () => ({ useCallRecordingPlayback: () => mocks.playback }));
vi.mock('~/core/debates/stream-playback', () => ({
  attachStreamSource: (_video: HTMLVideoElement, url: string, options: { onFatalError?: () => void }) => {
    const entry = { url, onFatalError: options.onFatalError, destroy: vi.fn() };
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
});
