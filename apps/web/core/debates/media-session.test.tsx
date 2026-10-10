import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateMediaSessionProvider, useDebateMediaSession } from './media-session';

const mocks = vi.hoisted(() => ({
  createLocalTracks: vi.fn(),
  enumerateDevices: vi.fn(),
  selectAudioOutput: vi.fn(),
  supportsAudioOutputSelection: vi.fn(),
}));

vi.mock('livekit-client', () => ({
  createLocalTracks: mocks.createLocalTracks,
  supportsAudioOutputSelection: mocks.supportsAudioOutputSelection,
}));

beforeEach(() => {
  mocks.createLocalTracks.mockReset();
  mocks.enumerateDevices.mockReset().mockResolvedValue([]);
  mocks.selectAudioOutput.mockReset().mockResolvedValue({
    deviceId: 'speaker-1',
    groupId: 'output',
    kind: 'audiooutput',
    label: 'Desk speaker',
  });
  mocks.supportsAudioOutputSelection.mockReset().mockReturnValue(false);
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
      selectAudioOutput: mocks.selectAudioOutput,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DebateMediaSessionProvider selective acquisition', () => {
  it('opens only the kinds that were asked for', async () => {
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
    ]);
    mocks.createLocalTracks.mockResolvedValue([{ mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() }]);

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure mic only' }));

    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    expect(mocks.createLocalTracks).toHaveBeenCalledWith(expect.objectContaining({ video: false }));
  });

  it('leaves the microphone shut for a camera-only request', async () => {
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'camera-1', groupId: 'video', kind: 'videoinput', label: 'Desk camera' },
    ]);
    mocks.createLocalTracks.mockResolvedValue([{ mediaStreamTrack: { kind: 'video' }, stop: vi.fn() }]);

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure camera only' }));

    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    expect(mocks.createLocalTracks).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
  });

  it('does not fail an audio-only request for the absence of a camera', async () => {
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
    ]);
    mocks.createLocalTracks.mockResolvedValue([{ mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() }]);

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure mic only' }));

    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
  });

  it('still fails a request for both when only one kind comes back', async () => {
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
    ]);
    mocks.createLocalTracks.mockResolvedValue([{ mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() }]);

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));

    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('unavailable'));
  });
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

  it('keeps an in-flight preview alive when the session is promoted', async () => {
    const stop = vi.fn();
    let resolveTracks: (tracks: Array<{ mediaStreamTrack: { kind: string }; stop: () => void }>) => void = () => {};
    mocks.createLocalTracks.mockReturnValue(
      new Promise(resolve => {
        resolveTracks = resolve;
      })
    );

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Promote debate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release match' }));
    act(() => {
      resolveTracks([
        { mediaStreamTrack: { kind: 'audio' }, stop },
        { mediaStreamTrack: { kind: 'video' }, stop },
      ]);
    });

    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('session-key')).toHaveTextContent('debate:debate-1');
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  it('allows speaker selection to recover in a later session', async () => {
    mocks.supportsAudioOutputSelection.mockReturnValue(true);
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'speaker-1', groupId: 'output', kind: 'audiooutput', label: 'Desk speaker' },
    ]);
    mocks.createLocalTracks.mockImplementation(() =>
      Promise.resolve([
        { mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() },
        { mediaStreamTrack: { kind: 'video' }, stop: vi.fn() },
      ])
    );
    mocks.selectAudioOutput.mockRejectedValueOnce(new Error('Selection failed'));

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Select speaker' }));
    await waitFor(() => expect(screen.getByTestId('audio-output-error')).not.toHaveTextContent('none'));

    fireEvent.click(screen.getByRole('button', { name: 'Start other match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));

    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('audio-output-supported')).toHaveTextContent('yes');
    expect(screen.getByTestId('audio-output-error')).toHaveTextContent('none');
  });
});

describe('DebateMediaSessionProvider acquisition that outlives its card', () => {
  it('stops tracks that arrive after the session was released', async () => {
    const stop = vi.fn();
    let deliver: (tracks: unknown[]) => void = () => undefined;
    mocks.createLocalTracks.mockReturnValue(
      new Promise(resolve => {
        deliver = resolve as (tracks: unknown[]) => void;
      })
    );

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Release match' }));
    await act(async () => {
      deliver([
        { mediaStreamTrack: { kind: 'audio' }, stop },
        { mediaStreamTrack: { kind: 'video' }, stop },
      ]);
      await Promise.resolve();
    });

    expect(stop).toHaveBeenCalled();
    expect(screen.getByTestId('session-key')).toHaveTextContent('none');
  });

  it('keeps tracks that arrive after the session was promoted', async () => {
    const stop = vi.fn();
    let deliver: (tracks: unknown[]) => void = () => undefined;
    mocks.createLocalTracks.mockReturnValue(
      new Promise(resolve => {
        deliver = resolve as (tracks: unknown[]) => void;
      })
    );

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Promote debate' }));
    await act(async () => {
      deliver([
        { mediaStreamTrack: { kind: 'audio' }, stop },
        { mediaStreamTrack: { kind: 'video' }, stop },
      ]);
      await Promise.resolve();
    });

    expect(stop).not.toHaveBeenCalled();
    expect(screen.getByTestId('session-key')).toHaveTextContent('debate:debate-1');
  });
});

describe('DebateMediaSessionProvider topping up a handed-over session', () => {
  async function withMicAlreadyOpen() {
    const micStop = vi.fn();
    mocks.createLocalTracks.mockResolvedValueOnce([{ mediaStreamTrack: { kind: 'audio' }, stop: micStop }]);
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure mic only' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    mocks.createLocalTracks.mockClear();
    return { micStop };
  }

  it('opens only the kind that is missing', async () => {
    const { micStop } = await withMicAlreadyOpen();
    mocks.createLocalTracks.mockResolvedValueOnce([{ mediaStreamTrack: { kind: 'video' }, stop: vi.fn() }]);

    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));

    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));
    expect(mocks.createLocalTracks).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    expect(mocks.createLocalTracks.mock.calls[0]?.[0]?.video).not.toBe(false);
    expect(micStop).not.toHaveBeenCalled();
  });

  it('does not re-announce a preview it is adding to', async () => {
    await withMicAlreadyOpen();
    let deliver: (tracks: unknown[]) => void = () => undefined;
    mocks.createLocalTracks.mockReturnValueOnce(
      new Promise(resolve => {
        deliver = resolve as (tracks: unknown[]) => void;
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));

    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('preview-state')).toHaveTextContent('ready');

    await act(async () => {
      deliver([{ mediaStreamTrack: { kind: 'video' }, stop: vi.fn() }]);
      await Promise.resolve();
    });
    expect(screen.getByTestId('preview-state')).toHaveTextContent('ready');
  });

  it('keeps the microphone when the camera it was adding fails', async () => {
    const { micStop } = await withMicAlreadyOpen();
    mocks.createLocalTracks.mockRejectedValueOnce(
      Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));

    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));
    expect(micStop).not.toHaveBeenCalled();
  });

  it('closes a kind that is no longer wanted', async () => {
    const cameraStop = vi.fn();
    mocks.createLocalTracks.mockResolvedValueOnce([
      { mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() },
      { mediaStreamTrack: { kind: 'video' }, stop: cameraStop },
    ]);
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    mocks.createLocalTracks.mockClear();
    mocks.createLocalTracks.mockResolvedValueOnce([{ mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() }]);

    fireEvent.click(screen.getByRole('button', { name: 'Ensure mic only' }));

    await waitFor(() => expect(cameraStop).toHaveBeenCalled());
  });
});

function MediaSessionHarness() {
  const media = useDebateMediaSession();

  return (
    <>
      <div data-testid="session-key">{media.activeSessionKey ?? 'none'}</div>
      <div data-testid="preview-state">{media.previewState}</div>
      <div data-testid="audio-output-supported">{media.audioOutputSupported ? 'yes' : 'no'}</div>
      <div data-testid="audio-output-error">{media.audioOutputError ?? 'none'}</div>
      <div data-testid="selected-devices">
        {media.selectedAudioInputId}/{media.selectedVideoInputId}
      </div>
      <button type="button" onClick={() => media.beginSession('match:match-1')}>
        Start match
      </button>
      <button type="button" onClick={() => media.beginSession('match:match-2')}>
        Start other match
      </button>
      <button type="button" onClick={() => void media.ensurePreview().catch(() => undefined)}>
        Ensure preview
      </button>
      <button
        type="button"
        onClick={() => void media.ensurePreview({ audio: true, video: false }).catch(() => undefined)}
      >
        Ensure mic only
      </button>
      <button
        type="button"
        onClick={() => void media.ensurePreview({ audio: false, video: true }).catch(() => undefined)}
      >
        Ensure camera only
      </button>
      <button type="button" onClick={() => media.promoteSession('match:match-1', 'debate:debate-1')}>
        Promote debate
      </button>
      <button type="button" onClick={() => void media.changeAudioOutput('speaker-1')}>
        Select speaker
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
