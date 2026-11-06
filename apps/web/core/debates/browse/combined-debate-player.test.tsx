import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'jotai';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import { store } from '~/core/state/jotai-store';

import { CombinedDebatePlayer } from './combined-debate-player';
import { DebateFeedPlayer } from './debate-feed-player';
import { inlinePlaybackUnavailableAtom, isTikTokInAppBrowser, useInlinePlaybackUnavailable } from './inline-playback';

const TIKTOK_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 musical_ly_47.5.0 BytedanceWebview/d8a21c6';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1';

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value });
}

const mocks = vi.hoisted(() => ({
  media: { data: undefined as { artifacts: { kind: string }[] } | undefined, isError: false },
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  load: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('~/core/analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/analytics')>()),
  capture: mocks.capture,
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
  mocks.capture.mockClear();
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

describe('isTikTokInAppBrowser', () => {
  it('matches TikTok only', () => {
    expect(isTikTokInAppBrowser(TIKTOK_IOS)).toBe(true);
    expect(isTikTokInAppBrowser('Mozilla/5.0 (iPhone) Mobile/15E148 trill_34.1.0 JsSdk/2.0')).toBe(true);
    for (const other of [
      SAFARI_IOS,
      'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone) Mobile/15E148 Instagram 350.0.0',
      'Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]',
      'Mozilla/5.0 (Linux; Android 10; wv) Chrome/75.0 aweme_230400 BytedanceWebview/d8a21c6',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    ]) {
      expect(isTikTokInAppBrowser(other)).toBe(false);
    }
  });

  it('never switches outside TikTok, even when a tile enters full screen', async () => {
    vi.resetModules();
    setUserAgent(SAFARI_IOS);
    const fresh = await import('./inline-playback');
    const { store: freshStore } = await import('~/core/state/jotai-store');
    function FreshProbe() {
      fresh.useInlinePlaybackUnavailable();
      return (
        <div data-debate-slot="1">
          <video data-testid="fresh-tile" />
        </div>
      );
    }
    vi.useFakeTimers();
    render(<FreshProbe />);
    const tile = screen.getByTestId('fresh-tile') as FullscreenVideo;
    tile.webkitDisplayingFullscreen = false;

    act(() => {
      tile.dispatchEvent(new Event('webkitbeginfullscreen'));
      vi.advanceTimersByTime(2_000);
    });

    expect(freshStore.get(fresh.inlinePlaybackUnavailableAtom)).toBe(false);
    expect(mocks.pause).not.toHaveBeenCalled();
    setUserAgent(TIKTOK_IOS);
  });
});

describe('useInlinePlaybackUnavailable', () => {
  beforeAll(() => setUserAgent(TIKTOK_IOS));

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
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith(
      'component_impression',
      expect.objectContaining({ component: 'debate_combined_player', fallback_reason: 'inline_playback_unavailable' })
    );
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
