import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'jotai';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import { store } from '~/core/state/jotai-store';

import { CombinedDebatePlayer } from './combined-debate-player';
import { DebateFeedPlayer } from './debate-feed-player';
import { inlinePlaybackUnavailableAtom, useInlinePlaybackUnavailable } from './inline-playback';

const mocks = vi.hoisted(() => ({
  media: { data: undefined as { artifacts: { kind: string }[] } | undefined, isError: false },
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  load: vi.fn(),
}));

vi.mock('~/core/debates/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/hooks')>()),
  useDebateMedia: () => mocks.media,
}));

const debate = { id: '01a1acb1b5c57d52b6f63e4e770c7bf4' } as Debate;

beforeEach(() => {
  store.set(inlinePlaybackUnavailableAtom, false);
  mocks.media = { data: undefined, isError: false };
  mocks.play.mockClear();
  mocks.pause.mockClear();
  mocks.load.mockClear();
  for (const [name, value] of Object.entries({ play: mocks.play, pause: mocks.pause, load: mocks.load })) {
    Object.defineProperty(HTMLMediaElement.prototype, name, { configurable: true, value });
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CombinedDebatePlayer', () => {
  it('plays the HEVC copy inside the tap', () => {
    mocks.media = { data: { artifacts: [{ kind: 'final_video' }, { kind: 'final_video_hevc' }] }, isError: false };
    const { container } = render(<CombinedDebatePlayer debate={debate} enabled />);

    fireEvent.click(screen.getByRole('button', { name: 'Play combined debate video' }));

    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(container.querySelector('video')?.getAttribute('src')).toMatch(
      /\/debates\/01a1acb1b5c57d52b6f63e4e770c7bf4\/media\/artifacts\/final_video_hevc\/content$/
    );
  });

  it('falls back to the WebM when the debate has no HEVC copy', () => {
    mocks.media = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    const { container } = render(<CombinedDebatePlayer debate={debate} enabled />);

    expect(container.querySelector('video')?.getAttribute('src')).toMatch(/\/artifacts\/final_video\/content$/);
  });

  it('waits for the media list, and says so when it fails', () => {
    const { rerender } = render(<CombinedDebatePlayer debate={debate} enabled />);
    expect(screen.getByRole('button', { name: 'Play combined debate video' })).toBeDisabled();

    mocks.media = { data: undefined, isError: true };
    rerender(<CombinedDebatePlayer debate={debate} enabled />);
    expect(screen.getByText(/Could not play this debate/)).toBeInTheDocument();
  });

  it('reloads a failed video before playing it again', () => {
    mocks.media = { data: { artifacts: [{ kind: 'final_video_hevc' }] }, isError: false };
    const { container } = render(<CombinedDebatePlayer debate={debate} enabled />);
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } });
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    fireEvent.error(video);

    fireEvent.click(screen.getByRole('button', { name: 'Play combined debate video' }));

    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.play).toHaveBeenCalledTimes(1);
  });

  it('reports its playback state to the page', () => {
    mocks.media = { data: { artifacts: [{ kind: 'final_video_hevc' }] }, isError: false };
    const onPlaybackState = vi.fn();
    const { container } = render(<CombinedDebatePlayer debate={debate} enabled onPlaybackState={onPlaybackState} />);

    fireEvent.playing(container.querySelector('video')!);

    expect(onPlaybackState).toHaveBeenLastCalledWith({ ready: true, playing: true, autoplayBlocked: false, error: false });
  });
});

describe('DebateFeedPlayer', () => {
  it('shows the combined player once inline playback is known to be unavailable', () => {
    store.set(inlinePlaybackUnavailableAtom, true);
    const { container } = render(
      <Provider store={store}>
        <DebateFeedPlayer debate={debate} active />
      </Provider>
    );

    expect(container.querySelector('[data-debate-combined-player]')).not.toBeNull();
  });
});

type FullscreenVideo = HTMLVideoElement & { webkitExitFullscreen?: () => void; webkitDisplayingFullscreen?: boolean };

function Probe() {
  const unavailable = useInlinePlaybackUnavailable();
  return (
    <>
      <output>{unavailable ? 'unavailable' : 'inline'}</output>
      <div data-debate-slot="1">
        <video data-testid="tile" />
      </div>
      <video data-testid="other" />
    </>
  );
}

function renderProbe() {
  render(
    <Provider store={store}>
      <Probe />
    </Provider>
  );
  const tile = screen.getByTestId('tile') as FullscreenVideo;
  tile.webkitDisplayingFullscreen = true;
  return tile;
}

describe('useInlinePlaybackUnavailable', () => {
  it('turns on once a debater tile that entered full screen has left it', () => {
    vi.useFakeTimers();
    const tile = renderProbe();
    let attempts = 0;
    // Ignored while entering, as on iOS; the second ask takes.
    tile.webkitExitFullscreen = () => {
      if (++attempts === 2) tile.webkitDisplayingFullscreen = false;
    };

    act(() => {
      tile.dispatchEvent(new Event('webkitbeginfullscreen'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('inline');
    expect(mocks.pause).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(attempts).toBe(2);
    expect(screen.getByRole('status')).toHaveTextContent('unavailable');
  });

  it('past the retry limit, waits for the viewer to close the native player', () => {
    vi.useFakeTimers();
    const tile = renderProbe();
    tile.webkitExitFullscreen = () => {};

    act(() => {
      tile.dispatchEvent(new Event('webkitbeginfullscreen'));
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('inline');

    act(() => {
      tile.webkitDisplayingFullscreen = false;
      tile.dispatchEvent(new Event('webkitendfullscreen'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('unavailable');
  });

  it('ignores full screen on a video outside the debater tiles', () => {
    renderProbe();

    act(() => {
      screen.getByTestId('other').dispatchEvent(new Event('webkitbeginfullscreen'));
    });

    expect(screen.getByRole('status')).toHaveTextContent('inline');
  });
});
