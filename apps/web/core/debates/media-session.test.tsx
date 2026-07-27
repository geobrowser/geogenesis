import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateMediaSessionProvider, useDebateMediaSession } from './media-session';

const mocks = vi.hoisted(() => ({
  createLocalTracks: vi.fn(),
  enumerateDevices: vi.fn(),
}));

vi.mock('livekit-client', () => ({
  createLocalTracks: mocks.createLocalTracks,
  supportsAudioOutputSelection: () => false,
}));

beforeEach(() => {
  mocks.createLocalTracks.mockReset();
  mocks.enumerateDevices.mockReset().mockResolvedValue([]);
  vi.stubGlobal(
    'MediaStream',
    class MediaStream {
      constructor(readonly tracks: MediaStreamTrack[] = []) {}
    }
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: mocks.enumerateDevices,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DebateMediaSessionProvider', () => {
  it('keeps preview tracks alive when a match session is promoted to a debate session', async () => {
    const stop = vi.fn();
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
      { deviceId: 'camera-1', groupId: 'video', kind: 'videoinput', label: 'Desk camera' },
    ]);
    mocks.createLocalTracks.mockResolvedValue([
      { mediaStreamTrack: { kind: 'audio' }, stop },
      { mediaStreamTrack: { kind: 'video' }, stop },
    ]);

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));

    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('selected-devices')).toHaveTextContent('mic-1/camera-1');

    fireEvent.click(screen.getByRole('button', { name: 'Promote debate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));

    await waitFor(() => expect(screen.getByTestId('session-key')).toHaveTextContent('debate:debate-1'));
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    expect(screen.getByTestId('selected-devices')).toHaveTextContent('mic-1/camera-1');

    fireEvent.click(screen.getByRole('button', { name: 'Release debate' }));

    expect(stop).toHaveBeenCalledTimes(2);
  });
});

function MediaSessionHarness() {
  const media = useDebateMediaSession();

  return (
    <>
      <div data-testid="session-key">{media.activeSessionKey ?? 'none'}</div>
      <div data-testid="preview-state">{media.previewState}</div>
      <div data-testid="selected-devices">
        {media.selectedAudioInputId}/{media.selectedVideoInputId}
      </div>
      <button type="button" onClick={() => media.beginSession('match:match-1')}>
        Start match
      </button>
      <button type="button" onClick={() => void media.ensurePreview()}>
        Ensure preview
      </button>
      <button type="button" onClick={() => media.promoteSession('match:match-1', 'debate:debate-1')}>
        Promote debate
      </button>
      <button type="button" onClick={() => media.releaseSession('match:match-1')}>
        Release match
      </button>
      <button type="button" onClick={() => media.releaseSession('debate:debate-1')}>
        Release debate
      </button>
    </>
  );
}
