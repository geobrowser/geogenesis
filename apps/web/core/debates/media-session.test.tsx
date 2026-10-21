import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readMediaDevicePreference, rememberMediaDevice } from '~/core/media/device-preferences';

import { DebateMediaSessionProvider, useDebateMediaSession } from './media-session';

const mocks = vi.hoisted(() => ({
  createLocalTracks: vi.fn(),
  enumerateDevices: vi.fn(),
  selectAudioOutput: vi.fn(),
  supportsAudioOutputSelection: vi.fn(),
  addDeviceListener: vi.fn(),
}));

vi.mock('livekit-client', () => ({
  createLocalTracks: mocks.createLocalTracks,
  supportsAudioOutputSelection: mocks.supportsAudioOutputSelection,
}));

beforeEach(() => {
  window.localStorage.clear();
  mocks.createLocalTracks.mockReset();
  mocks.enumerateDevices.mockReset().mockResolvedValue([]);
  mocks.selectAudioOutput.mockReset().mockResolvedValue({
    deviceId: 'speaker-1',
    groupId: 'output',
    kind: 'audiooutput',
    label: 'Desk speaker',
  });
  mocks.supportsAudioOutputSelection.mockReset().mockReturnValue(false);
  mocks.addDeviceListener.mockReset();
  vi.stubGlobal(
    'MediaStream',
    class MediaStream {
      constructor(readonly tracks: MediaStreamTrack[] = []) {}

      getTracks() {
        return this.tracks;
      }
    }
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: mocks.enumerateDevices,
      selectAudioOutput: mocks.selectAudioOutput,
      addEventListener: mocks.addDeviceListener,
      removeEventListener: vi.fn(),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function fireDeviceChange() {
  const handler = mocks.addDeviceListener.mock.calls.find(call => call[0] === 'devicechange')?.[1] as
    (() => void) | undefined;
  expect(handler).toBeTypeOf('function');
  await act(async () => {
    handler?.();
    await Promise.resolve();
  });
}

describe('remembered devices across debate sessions', () => {
  it('restores saved input and output devices after the provider remounts', async () => {
    mocks.supportsAudioOutputSelection.mockReturnValue(true);
    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-2' },
      { kind: 'videoinput', deviceId: 'camera-2' },
      { kind: 'audiooutput', deviceId: 'speaker-1' },
    ]);
    mocks.createLocalTracks.mockImplementation(async () => [
      { mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() },
      { mediaStreamTrack: { kind: 'video' }, stop: vi.fn() },
    ]);
    const first = render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select microphone' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Select camera' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Select speaker' }));
    await waitFor(() => expect(readMediaDevicePreference('audiooutput')).toBe('speaker-1'));
    expect(readMediaDevicePreference('audioinput')).toBe('mic-2');
    expect(readMediaDevicePreference('videoinput')).toBe('camera-2');
    first.unmount();
    mocks.createLocalTracks.mockClear();
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    expect(mocks.createLocalTracks).toHaveBeenLastCalledWith({
      audio: { deviceId: 'mic-2' },
      video: { deviceId: 'camera-2' },
    });
    expect(screen.getByTestId('selected-output')).toHaveTextContent('speaker-1');
  });

  it('keeps a disconnected preference and restores it on devicechange', async () => {
    rememberMediaDevice('audioinput', 'mic-2');
    mocks.enumerateDevices.mockResolvedValue([{ kind: 'audioinput', deviceId: 'default', label: 'Default mic' }]);
    mocks.createLocalTracks.mockResolvedValue([{ mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() }]);
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure mic only' }));
    await waitFor(() => expect(screen.getByTestId('selected-devices')).toHaveTextContent('default/'));
    expect(readMediaDevicePreference('audioinput')).toBe('mic-2');
    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'default', label: 'Default mic' },
      { kind: 'audioinput', deviceId: 'mic-2' },
    ]);
    await fireDeviceChange();
    await waitFor(() =>
      expect(mocks.createLocalTracks).toHaveBeenLastCalledWith({ audio: { deviceId: 'mic-2' }, video: false })
    );
  });

  it('reads a choice made by another surface when the next session starts', () => {
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    act(() => rememberMediaDevice('audioinput', 'community-call-mic'));
    fireEvent.click(screen.getByRole('button', { name: 'Start other match' }));
    expect(screen.getByTestId('selected-devices')).toHaveTextContent('community-call-mic/');
  });
});

describe('DebateMediaSessionProvider restarts it starts itself', () => {
  it('keeps the camera shut through a device change over a mic-only session', async () => {
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
      { deviceId: 'camera-1', groupId: 'video', kind: 'videoinput', label: 'Desk camera' },
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
    mocks.createLocalTracks.mockClear();

    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
      { deviceId: 'camera-2', groupId: 'video', kind: 'videoinput', label: 'New camera' },
    ]);
    await fireDeviceChange();

    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalled());
    expect(mocks.createLocalTracks).toHaveBeenLastCalledWith(expect.objectContaining({ video: false }));
  });

  it('keeps the camera shut through a device change after a hand-off', async () => {
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
      { deviceId: 'camera-1', groupId: 'video', kind: 'videoinput', label: 'Desk camera' },
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

    fireEvent.click(screen.getByRole('button', { name: 'Promote debate' }));
    await waitFor(() => expect(screen.getByTestId('session-key')).toHaveTextContent('debate:debate-1'));
    mocks.createLocalTracks.mockClear();

    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
      { deviceId: 'camera-2', groupId: 'video', kind: 'videoinput', label: 'New camera' },
    ]);
    await fireDeviceChange();

    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalled());
    expect(mocks.createLocalTracks).toHaveBeenLastCalledWith(expect.objectContaining({ video: false }));
  });

  /*
   * The same the other way round, which is the half that shipped broken: remembering the camera and
   * not the microphone let a camera-only card pick up a microphone on the first device change.
   */
  it('keeps the microphone shut through a device change over a camera-only session', async () => {
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
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
    mocks.createLocalTracks.mockClear();

    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-2', groupId: 'audio', kind: 'audioinput', label: 'New mic' },
      { deviceId: 'camera-1', groupId: 'video', kind: 'videoinput', label: 'Desk camera' },
    ]);
    await fireDeviceChange();

    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalled());
    expect(mocks.createLocalTracks).toHaveBeenLastCalledWith(expect.objectContaining({ audio: false }));
  });

  it('asks for both again once a new surface takes the session', async () => {
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
    mocks.createLocalTracks.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Start other match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));

    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalled());
    expect(mocks.createLocalTracks).toHaveBeenLastCalledWith(expect.objectContaining({ audio: expect.anything() }));
    expect(mocks.createLocalTracks.mock.calls.at(-1)?.[0]?.video).toBeTruthy();
  });
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

describe('DebateMediaSessionProvider join choice', () => {
  it('hands a card’s choice to the session it is promoted to, and clears it for the next surface', async () => {
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose mic only' }));
    fireEvent.click(screen.getByRole('button', { name: 'Promote debate' }));

    await waitFor(() => expect(screen.getByTestId('session-key')).toHaveTextContent('debate:debate-1'));
    expect(screen.getByTestId('join-choice')).toHaveTextContent('{"micOn":true,"cameraOn":false}');

    fireEvent.click(screen.getByRole('button', { name: 'Start other match' }));

    await waitFor(() => expect(screen.getByTestId('session-key')).toHaveTextContent('match:match-2'));
    expect(screen.getByTestId('join-choice')).toHaveTextContent('null');
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

    fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));

    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));
    expect(micStop).not.toHaveBeenCalled();
  });

  it('keeps the same stream and stops asking for the camera after it fails', async () => {
    const { micStop } = await withMicAlreadyOpen();
    const streamBefore = screen.getByTestId('preview-stream').textContent;
    mocks.createLocalTracks.mockRejectedValueOnce(
      Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('error'));
    expect(screen.getByTestId('preview-stream')).toHaveTextContent(streamBefore ?? '');

    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));

    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    expect(micStop).not.toHaveBeenCalled();
    expect(screen.getByTestId('preview-stream')).toHaveTextContent(streamBefore ?? '');
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

describe('DebateMediaSessionProvider asked for nothing', () => {
  it('does not report a preview it never opened', async () => {
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
    ]);
    mocks.createLocalTracks.mockResolvedValue([]);

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure neither' }));

    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('idle'));
    expect(mocks.createLocalTracks).not.toHaveBeenCalled();
  });
});

describe('DebateMediaSessionProvider overlapping requests', () => {
  function deferredTracks() {
    let release!: (tracks: unknown[]) => void;
    const pending = new Promise<unknown[]>(resolve => {
      release = resolve;
    });
    return { pending, release: (tracks: unknown[]) => release(tracks) };
  }

  it('does not hand a camera request the microphone’s acquisition', async () => {
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
      { deviceId: 'camera-1', groupId: 'video', kind: 'videoinput', label: 'Desk camera' },
    ]);
    const micTrack = { mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() };
    const cameraTrack = { mediaStreamTrack: { kind: 'video' }, stop: vi.fn() };
    const first = deferredTracks();
    mocks.createLocalTracks.mockReturnValueOnce(first.pending).mockResolvedValue([cameraTrack]);

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure mic only' }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));
    first.release([micTrack]);

    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(2));
    // The camera it asked for, and not the microphone it already had.
    expect(mocks.createLocalTracks).toHaveBeenLastCalledWith(expect.objectContaining({ audio: false }));
    expect(mocks.createLocalTracks.mock.calls[1]?.[0]?.video).toBeTruthy();
    expect(micTrack.stop).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
  });

  it('opens nothing for a session released while it waited', async () => {
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
    ]);
    let release!: (tracks: unknown[]) => void;
    const pending = new Promise<unknown[]>(resolve => {
      release = resolve;
    });
    mocks.createLocalTracks.mockReturnValueOnce(pending).mockResolvedValue([]);

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure mic only' }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release match' }));

    release([{ mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() }]);
    await waitFor(() => expect(screen.getByTestId('session-key')).toHaveTextContent('none'));

    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
  });

  it('shares one refusal between two requests for the same kinds', async () => {
    mocks.enumerateDevices.mockResolvedValue([
      { deviceId: 'mic-1', groupId: 'audio', kind: 'audioinput', label: 'Studio mic' },
    ]);
    let refuse!: (error: Error) => void;
    const pending = new Promise<unknown[]>((_resolve, reject) => {
      refuse = reject;
    });
    mocks.createLocalTracks.mockReturnValueOnce(pending).mockResolvedValue([]);

    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure mic only' }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure mic only' }));

    refuse(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));

    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('denied'));
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
  });
});

const streamIds = new WeakMap<object, number>();
let nextStreamId = 1;

function streamId(stream: MediaStream | null) {
  if (!stream) return 'none';
  if (!streamIds.has(stream)) streamIds.set(stream, nextStreamId++);
  return `stream-${streamIds.get(stream)}`;
}

function MediaSessionHarness() {
  const media = useDebateMediaSession();

  return (
    <>
      <div data-testid="preview-stream">{streamId(media.previewStream)}</div>
      <div data-testid="session-key">{media.activeSessionKey ?? 'none'}</div>
      <div data-testid="join-choice">{JSON.stringify(media.joinChoiceRef.current)}</div>
      <button type="button" onClick={() => (media.joinChoiceRef.current = { micOn: true, cameraOn: false })}>
        Choose mic only
      </button>
      <div data-testid="selected-output">{media.selectedAudioOutputId}</div>
      <button type="button" onClick={() => media.changeAudioInput('mic-2')}>
        Select microphone
      </button>
      <button type="button" onClick={() => media.changeVideoInput('camera-2')}>
        Select camera
      </button>
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
        onClick={() => void media.ensurePreview({ audio: true, video: true }).catch(() => undefined)}
      >
        Ensure both
      </button>
      <button
        type="button"
        onClick={() => void media.ensurePreview({ audio: false, video: false }).catch(() => undefined)}
      >
        Ensure neither
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
