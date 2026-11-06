import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'jotai';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { CombinedDebatePlayer } from './combined-debate-player';
import { useInlinePlaybackUnavailable } from './inline-playback';

const mocks = vi.hoisted(() => ({
  media: { data: undefined as { artifacts: { kind: string }[] } | undefined },
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateMedia: () => mocks.media,
}));

const debate = { id: '01a1acb1b5c57d52b6f63e4e770c7bf4' } as Debate;

beforeEach(() => {
  mocks.media = { data: undefined };
  mocks.play.mockClear();
  mocks.pause.mockClear();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: mocks.play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: mocks.pause });
});

afterEach(cleanup);

describe('CombinedDebatePlayer', () => {
  it('plays the HEVC copy inside the tap', () => {
    mocks.media = { data: { artifacts: [{ kind: 'final_video' }, { kind: 'final_video_hevc' }] } };
    const { container } = render(<CombinedDebatePlayer debate={debate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play combined debate video' }));

    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(container.querySelector('video')?.getAttribute('src')).toMatch(
      /\/debates\/01a1acb1b5c57d52b6f63e4e770c7bf4\/media\/artifacts\/final_video_hevc\/content$/
    );
  });

  it('falls back to the WebM when the debate has no HEVC copy', () => {
    mocks.media = { data: { artifacts: [{ kind: 'final_video' }] } };
    const { container } = render(<CombinedDebatePlayer debate={debate} />);

    expect(container.querySelector('video')?.getAttribute('src')).toMatch(/\/artifacts\/final_video\/content$/);
  });

  it('waits for the media list before it can play', () => {
    render(<CombinedDebatePlayer debate={debate} />);

    expect(screen.getByRole('button', { name: 'Play combined debate video' })).toBeDisabled();
  });
});

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

describe('useInlinePlaybackUnavailable', () => {
  it('turns on once a debater tile that entered full screen has left it', () => {
    vi.useFakeTimers();
    render(
      <Provider>
        <Probe />
      </Provider>
    );
    const tile = screen.getByTestId('tile') as HTMLVideoElement & {
      webkitExitFullscreen?: () => void;
      webkitDisplayingFullscreen?: boolean;
    };
    let attempts = 0;
    tile.webkitDisplayingFullscreen = true;
    // Ignored while entering, as on iOS; the second ask takes.
    tile.webkitExitFullscreen = () => {
      attempts++;
      if (attempts === 2) tile.webkitDisplayingFullscreen = false;
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
    vi.useRealTimers();
  });

  it('ignores full screen on a video outside the debater tiles', () => {
    render(
      <Provider>
        <Probe />
      </Provider>
    );

    act(() => {
      screen.getByTestId('other').dispatchEvent(new Event('webkitbeginfullscreen'));
    });

    expect(screen.getByRole('status')).toHaveTextContent('inline');
  });
});
