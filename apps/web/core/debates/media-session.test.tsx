import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readMediaDevicePreference, rememberMediaDevice } from '~/core/media/device-preferences';

import { DebateMediaSessionProvider, localTrackSource, useDebateMediaSession } from './media-session';

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

      getAudioTracks() {
        return this.tracks.filter(track => track.kind === 'audio');
      }

      getVideoTracks() {
        return this.tracks.filter(track => track.kind === 'video');
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

// Exercise LiveKit's real constraint conversion instead of mocking restartTrack. A browser may
// choose its default for an ideal device ID; an exact ID must open that hardware or reject.
class DeviceCapture extends EventTarget {
  enabled = true;
  muted = false;
  readyState = 'live';
  id = crypto.randomUUID();
  constructor(
    readonly kind: 'audio' | 'video',
    private readonly deviceId: string
  ) {
    super();
  }
  getSettings() {
    return { deviceId: this.deviceId };
  }
  getConstraints() {
    return { deviceId: this.deviceId };
  }
  applyConstraints = vi.fn().mockResolvedValue(undefined);
  stop() {
    this.readyState = 'ended';
  }
}

describe('device selection through LiveKit', () => {
  it.each([
    { kind: 'audio' as const, processed: false, unavailable: false },
    { kind: 'audio' as const, processed: true, unavailable: false },
    { kind: 'video' as const, processed: false, unavailable: false },
    { kind: 'audio' as const, processed: true, unavailable: true },
    { kind: 'video' as const, processed: false, unavailable: true },
  ])(
    'confirms $kind capture or recovers the previous device (processed: $processed, unavailable: $unavailable)',
    async ({ kind, processed, unavailable }) => {
      rememberMediaDevice('audioinput', 'mic-1');
      rememberMediaDevice('videoinput', 'camera-1');
      const sdk = await vi.importActual<typeof import('livekit-client')>('livekit-client');
      const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
        const tracks = (['audio', 'video'] as const).flatMap(mediaKind => {
          const constraint = constraints[mediaKind];
          if (!constraint) return [];
          const requested = typeof constraint === 'object' ? constraint.deviceId : undefined;
          const exact = typeof requested === 'object' && !Array.isArray(requested) ? requested.exact : undefined;
          if (unavailable && (exact === 'mic-2' || exact === 'camera-2')) {
            throw new DOMException('Device is no longer available', 'OverconstrainedError');
          }
          if (
            exact &&
            !(mediaKind === 'audio' ? ['mic-1', 'mic-2'] : ['camera-1', 'camera-2']).includes(String(exact))
          ) {
            throw new DOMException('Device is not of the requested kind', 'OverconstrainedError');
          }
          const deviceId = typeof exact === 'string' ? exact : mediaKind === 'audio' ? 'mic-1' : 'camera-1';
          return [new DeviceCapture(mediaKind, deviceId) as unknown as MediaStreamTrack];
        });
        return new MediaStream(tracks);
      });
      Object.assign(navigator.mediaDevices, { getUserMedia });
      mocks.createLocalTracks.mockImplementation(sdk.createLocalTracks);
      mocks.enumerateDevices.mockResolvedValue([
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Old mic' },
        { kind: 'audioinput', deviceId: 'mic-2', label: 'New mic' },
        { kind: 'videoinput', deviceId: 'camera-1', label: 'Old camera' },
        { kind: 'videoinput', deviceId: 'camera-2', label: 'New camera' },
      ]);
      render(
        <DebateMediaSessionProvider>
          <MediaSessionHarness />
        </DebateMediaSessionProvider>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
      fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));
      await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
      const tracks = (await mocks.createLocalTracks.mock.results[0].value) as import('livekit-client').LocalTrack[];
      const selectedTrack = tracks.find(track => track.kind === kind)!;
      if (processed) {
        (selectedTrack as import('livekit-client').LocalAudioTrack).setAudioContext({} as AudioContext);
        const processor = {
          name: 'test-noise-filter',
          processedTrack: new DeviceCapture('audio', 'processed') as unknown as MediaStreamTrack,
          init: async () => {},
          restart: async () => {
            processor.processedTrack = new DeviceCapture('audio', 'processed') as unknown as MediaStreamTrack;
          },
          destroy: async () => {},
        };
        await selectedTrack.setProcessor(processor);
      }
      const replaceTrack = vi.fn().mockResolvedValue(undefined);
      selectedTrack.sender = { replaceTrack } as unknown as RTCRtpSender;
      fireEvent.click(screen.getByRole('button', { name: kind === 'audio' ? 'Select microphone' : 'Select camera' }));
      const expectedCaptures = unavailable ? 3 : 2;
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(expectedCaptures));
      await waitFor(() => expect(screen.getByTestId('preview-busy')).toHaveTextContent('false'));
      expect(screen.getByTestId('selected-devices')).toHaveTextContent(
        unavailable ? 'mic-1/camera-1' : kind === 'audio' ? 'mic-2/camera-1' : 'mic-1/camera-2'
      );
      const deviceId = `${kind === 'audio' ? 'mic' : 'camera'}-${unavailable ? 1 : 2}`;
      expect(selectedTrack.getSourceTrackSettings().deviceId).toBe(deviceId);
      expect(screen.getByTestId('preview-devices')).toHaveTextContent(`${kind}:${processed ? 'processed' : deviceId}`);
      expect(replaceTrack).toHaveBeenCalledWith(selectedTrack.mediaStreamTrack);
      expect(readMediaDevicePreference(kind === 'audio' ? 'audioinput' : 'videoinput')).toBe(deviceId);
      if (unavailable) expect(screen.getByTestId('preview-error')).not.toBeEmptyDOMElement();
      expect(mocks.createLocalTracks).toHaveBeenCalledOnce();
      expect(getUserMedia).toHaveBeenCalledTimes(expectedCaptures);
    }
  );

  it.each(['audio', 'video'] as const)(
    'reads the %s capture from a combined stream regardless of track order',
    kind => {
      const source = new DeviceCapture(kind, 'capture') as unknown as MediaStreamTrack;
      const unrelated = new DeviceCapture(
        kind === 'audio' ? 'video' : 'audio',
        'other-device'
      ) as unknown as MediaStreamTrack;
      const processed = new DeviceCapture(kind, 'processed') as unknown as MediaStreamTrack;
      expect(localTrackSource({ mediaStreamTrack: processed, mediaStream: new MediaStream([unrelated, source]) })).toBe(
        source
      );
    }
  );
});

describe('remembered devices across debate sessions', () => {
  it('restores saved input and output devices after the provider remounts', async () => {
    mocks.supportsAudioOutputSelection.mockReturnValue(true);
    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-2' },
      { kind: 'videoinput', deviceId: 'camera-2' },
      { kind: 'audiooutput', deviceId: 'speaker-1' },
    ]);
    mocks.createLocalTracks.mockImplementation(async () => [
      restartableTrack('audio', 'mic-2'),
      restartableTrack('video', 'camera-2'),
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
    const audio = restartableTrack('audio', 'default');
    mocks.createLocalTracks.mockResolvedValue([audio]);
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
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'mic-2' } }));
    expect(mocks.createLocalTracks).toHaveBeenCalledOnce();
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

describe('confirmed input preferences', () => {
  it.each([
    { kind: 'audioinput' as const, button: 'Select microphone', selected: 'mic-2/old-camera' },
    { kind: 'videoinput' as const, button: 'Select camera', selected: 'old-mic/camera-2' },
  ])(
    'saves $kind only after capture succeeds and keeps the previous choice on failure',
    async ({ kind, button, selected }) => {
      rememberMediaDevice('audioinput', 'old-mic');
      rememberMediaDevice('videoinput', 'old-camera');
      mocks.enumerateDevices.mockResolvedValue([
        { kind: 'audioinput', deviceId: 'old-mic', label: 'Old mic' },
        { kind: 'audioinput', deviceId: 'mic-2', label: 'New mic' },
        { kind: 'videoinput', deviceId: 'old-camera', label: 'Old camera' },
        { kind: 'videoinput', deviceId: 'camera-2', label: 'New camera' },
      ]);
      const audio = restartableTrack('audio', 'old-mic');
      const video = restartableTrack('video', 'old-camera');
      const chosen = kind === 'audioinput' ? audio : video;
      const restart = chosen.restartTrack.getMockImplementation()!;
      mocks.createLocalTracks.mockResolvedValue([audio, video]);
      render(
        <DebateMediaSessionProvider>
          <MediaSessionHarness />
        </DebateMediaSessionProvider>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
      fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));
      await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
      const oldPreference = readMediaDevicePreference(kind);
      let fail!: (error: Error) => void;
      chosen.restartTrack.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          fail = reject;
        })
      );
      fireEvent.click(screen.getByRole('button', { name: button }));
      await waitFor(() => expect(chosen.restartTrack).toHaveBeenCalledOnce());
      expect(readMediaDevicePreference(kind)).toBe(oldPreference);
      await act(async () => fail(new Error('Device unavailable')));
      await waitFor(() => expect(screen.getByTestId('preview-busy')).toHaveTextContent('false'));
      expect(screen.getByTestId('preview-error')).not.toBeEmptyDOMElement();
      expect(readMediaDevicePreference(kind)).toBe(oldPreference);
      expect(screen.getByTestId('selected-devices')).toHaveTextContent('old-mic/old-camera');

      let finish!: () => void;
      chosen.restartTrack.mockImplementationOnce(async options => {
        await new Promise<void>(resolve => {
          finish = resolve;
        });
        await restart(options);
      });
      fireEvent.click(screen.getByRole('button', { name: button }));
      await waitFor(() => expect(chosen.restartTrack).toHaveBeenCalledTimes(3));
      expect(readMediaDevicePreference(kind)).toBe(oldPreference);
      await act(async () => finish());
      await waitFor(() => expect(readMediaDevicePreference(kind)).toBe(kind === 'audioinput' ? 'mic-2' : 'camera-2'));
      expect(screen.getByTestId('selected-devices')).toHaveTextContent(selected);
      expect(mocks.createLocalTracks).toHaveBeenCalledOnce();
      expect((kind === 'audioinput' ? video : audio).restartTrack).not.toHaveBeenCalled();
    }
  );

  it.each([
    { kind: 'audioinput' as const, button: 'Select microphone', mediaKind: 'audio', expected: 'actual-device/' },
    { kind: 'videoinput' as const, button: 'Select camera', mediaKind: 'video', expected: '/actual-device' },
  ])(
    'does not remember a missing $kind when capture silently substitutes another device',
    async ({ kind, button, mediaKind, expected }) => {
      rememberMediaDevice(kind, 'working-device');
      mocks.enumerateDevices.mockResolvedValue([
        { kind, deviceId: 'working-device', label: 'Working device' },
        { kind, deviceId: kind === 'audioinput' ? 'mic-2' : 'camera-2', label: 'Requested device' },
        { kind, deviceId: 'actual-device', label: 'Actual device' },
      ]);
      const capture = restartableTrack(mediaKind as 'audio' | 'video', 'actual-device');
      const restart = capture.restartTrack.getMockImplementation()!;
      capture.restartTrack.mockImplementationOnce(async () => restart({ deviceId: 'actual-device' }));
      mocks.createLocalTracks.mockResolvedValue([capture]);
      render(
        <DebateMediaSessionProvider>
          <MediaSessionHarness />
        </DebateMediaSessionProvider>
      );
      fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
      fireEvent.click(
        screen.getByRole('button', { name: mediaKind === 'audio' ? 'Ensure mic only' : 'Ensure camera only' })
      );
      await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
      fireEvent.click(screen.getByRole('button', { name: button }));
      await waitFor(() => expect(screen.getByTestId('selected-devices')).toHaveTextContent(expected));
      expect(readMediaDevicePreference(kind)).toBe('working-device');
      await fireDeviceChange();
      expect(screen.getByTestId('selected-devices')).toHaveTextContent(expected);
      expect(mocks.createLocalTracks).toHaveBeenCalledOnce();
      expect(capture.restartTrack).toHaveBeenCalledOnce();
    }
  );

  it.each([
    { kind: 'audioinput' as const, button: 'Select microphone' },
    { kind: 'videoinput' as const, button: 'Select camera' },
  ])('does not save a pending $kind choice after the session is released', async ({ kind, button }) => {
    rememberMediaDevice(kind, 'working-device');
    let finish!: (value: unknown[]) => void;
    mocks.createLocalTracks.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Release match' }));
    await act(async () =>
      finish([
        { mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() },
        { mediaStreamTrack: { kind: 'video' }, stop: vi.fn() },
      ])
    );
    expect(readMediaDevicePreference(kind)).toBe('working-device');
  });

  it('keeps this session’s choices when another surface changes preferences before devicechange', async () => {
    rememberMediaDevice('audioinput', 'old-mic');
    rememberMediaDevice('videoinput', 'old-camera');
    rememberMediaDevice('audiooutput', 'old-speaker');
    mocks.supportsAudioOutputSelection.mockReturnValue(true);
    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'old-mic', label: 'Old mic' },
      { kind: 'videoinput', deviceId: 'old-camera', label: 'Old camera' },
      { kind: 'audiooutput', deviceId: 'old-speaker', label: 'Old speaker' },
    ]);
    mocks.createLocalTracks.mockResolvedValue([
      { mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() },
      { mediaStreamTrack: { kind: 'video' }, stop: vi.fn() },
    ]);
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    act(() => {
      rememberMediaDevice('audioinput', 'other-mic');
      rememberMediaDevice('videoinput', 'other-camera');
      rememberMediaDevice('audiooutput', 'other-speaker');
    });
    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'old-mic', label: 'Old mic' },
      { kind: 'audioinput', deviceId: 'other-mic', label: 'Other mic' },
      { kind: 'videoinput', deviceId: 'old-camera', label: 'Old camera' },
      { kind: 'videoinput', deviceId: 'other-camera', label: 'Other camera' },
      { kind: 'audiooutput', deviceId: 'old-speaker', label: 'Old speaker' },
      { kind: 'audiooutput', deviceId: 'other-speaker', label: 'Other speaker' },
    ]);
    await fireDeviceChange();
    expect(screen.getByTestId('selected-devices')).toHaveTextContent('old-mic/old-camera');
    expect(screen.getByTestId('selected-output')).toHaveTextContent('old-speaker');
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
  });

  it('retains a saved speaker while output enumeration is redacted', async () => {
    rememberMediaDevice('audiooutput', 'headphones');
    mocks.supportsAudioOutputSelection.mockReturnValue(true);
    mocks.enumerateDevices.mockResolvedValue([{ kind: 'audiooutput', deviceId: 'default', label: '' }]);
    mocks.createLocalTracks.mockResolvedValue([{ mediaStreamTrack: { kind: 'audio' }, stop: vi.fn() }]);
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure mic only' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('selected-output')).toHaveTextContent('headphones');
    expect(mocks.selectAudioOutput).not.toHaveBeenCalled();
  });
});

describe('live speaker preference commits', () => {
  it('waits for successful routing before remembering the authorized speaker', async () => {
    rememberMediaDevice('audiooutput', 'default');
    mocks.supportsAudioOutputSelection.mockReturnValue(true);
    let finish!: (result: boolean) => void;
    const route = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          finish = resolve;
        })
    );
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness outputRoute={route} />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select speaker' }));
    await waitFor(() => expect(route).toHaveBeenCalledWith('speaker-1'));
    expect(readMediaDevicePreference('audiooutput')).toBe('default');
    fireEvent.click(screen.getByRole('button', { name: 'Report earlier route failure' }));
    await act(async () => finish(true));
    await waitFor(() => expect(readMediaDevicePreference('audiooutput')).toBe('speaker-1'));
    expect(screen.getByTestId('audio-output-error')).toHaveTextContent('none');
  });

  it('serializes live routes so the newest speaker is applied and remembered last', async () => {
    rememberMediaDevice('audiooutput', 'default');
    mocks.supportsAudioOutputSelection.mockReturnValue(true);
    mocks.selectAudioOutput.mockImplementation(async ({ deviceId }: { deviceId: string }) => ({ deviceId }));
    let finishFirst!: () => void;
    const route = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            finishFirst = resolve;
          })
      )
      .mockResolvedValue(true);
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness outputRoute={route} />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select speaker' }));
    await waitFor(() => expect(route).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Select other speaker' }));
    await waitFor(() => expect(mocks.selectAudioOutput).toHaveBeenCalledTimes(2));
    expect(route).toHaveBeenCalledTimes(1);
    await act(async () => finishFirst());
    await waitFor(() => expect(readMediaDevicePreference('audiooutput')).toBe('speaker-2'));
    expect(route.mock.calls.map(call => call[0])).toEqual(['speaker-1', 'speaker-2']);
  });

  it.each([
    'authorization before routing finishes',
    'authorization after routing finishes',
    'routing rejection',
    'routing refusal',
  ])('keeps the last successful route selected and remembered when a newer choice fails: %s', async failure => {
    rememberMediaDevice('audiooutput', 'default');
    mocks.supportsAudioOutputSelection.mockReturnValue(true);
    let denySecond!: (error: Error) => void;
    mocks.selectAudioOutput.mockImplementation(({ deviceId }: { deviceId: string }) => {
      if (deviceId === 'speaker-2' && failure.startsWith('authorization')) {
        return new Promise((_resolve, reject) => {
          denySecond = reject;
        });
      }
      return Promise.resolve({ deviceId });
    });
    let finishFirst!: () => void;
    const firstRoute = new Promise<void>(resolve => {
      finishFirst = resolve;
    });
    let routedSpeaker = 'default';
    const route = vi.fn(async (id: string) => {
      if (id === 'speaker-1') await firstRoute;
      else if (failure === 'routing rejection') throw new Error('No route');
      else if (failure === 'routing refusal') return false;
      routedSpeaker = id;
      return true;
    });
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness outputRoute={route} />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select speaker' }));
    await waitFor(() => expect(route).toHaveBeenCalledWith('speaker-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Select other speaker' }));
    await waitFor(() => expect(mocks.selectAudioOutput).toHaveBeenCalledTimes(2));
    if (failure === 'authorization before routing finishes') {
      await act(async () => denySecond(new Error('Denied')));
      expect(screen.getByTestId('audio-output-error')).toHaveTextContent('Could not move audio');
    }
    await act(async () => finishFirst());
    if (failure === 'authorization after routing finishes') {
      await act(async () => denySecond(new Error('Denied')));
    }
    await waitFor(() => expect(screen.getByTestId('audio-output-error')).toHaveTextContent('Could not move audio'));
    expect(routedSpeaker).toBe('speaker-1');
    expect(readMediaDevicePreference('audiooutput')).toBe(routedSpeaker);
    expect(screen.getByTestId('selected-output')).toHaveTextContent(routedSpeaker);
  });

  it.each(['release', 'new session', 'unmount'])('does not commit a pending route after %s', async cancellation => {
    rememberMediaDevice('audiooutput', 'default');
    mocks.supportsAudioOutputSelection.mockReturnValue(true);
    let finish!: () => void;
    const route = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    const view = render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness outputRoute={route} />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select speaker' }));
    await waitFor(() => expect(route).toHaveBeenCalledWith('speaker-1'));
    if (cancellation === 'unmount') view.unmount();
    else
      fireEvent.click(
        screen.getByRole('button', { name: cancellation === 'release' ? 'Release match' : 'Start other match' })
      );
    await act(async () => finish());
    expect(readMediaDevicePreference('audiooutput')).toBe('default');
    if (cancellation !== 'unmount') expect(screen.getByTestId('selected-output')).toHaveTextContent('default');
  });

  it.each(['rejects', 'returns false'])('preserves the working preference when live routing %s', async failure => {
    rememberMediaDevice('audiooutput', 'default');
    mocks.supportsAudioOutputSelection.mockReturnValue(true);
    const route =
      failure === 'rejects' ? vi.fn().mockRejectedValue(new Error('No route')) : vi.fn().mockResolvedValue(false);
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness outputRoute={route} />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select speaker' }));
    await waitFor(() => expect(screen.getByTestId('audio-output-error')).toHaveTextContent('Could not move audio'));
    expect(readMediaDevicePreference('audiooutput')).toBe('default');
    expect(screen.getByTestId('selected-output')).toHaveTextContent('default');
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

    expect(mocks.createLocalTracks).not.toHaveBeenCalled();
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

    expect(mocks.createLocalTracks).not.toHaveBeenCalled();
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

    expect(mocks.createLocalTracks).not.toHaveBeenCalled();
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

function restartableTrack(kind: 'audio' | 'video', deviceId: string) {
  const listeners = new Map<string, () => void>();
  let source = { kind, enabled: true, readyState: 'live', getSettings: () => ({ deviceId }) };
  const track = {
    get mediaStreamTrack() {
      return source;
    },
    get mediaStream() {
      return { getTracks: () => [source] };
    },
    restartTrack: vi.fn(async (options?: { deviceId?: ConstrainDOMString }) => {
      const requested = options?.deviceId;
      const nextId =
        typeof requested === 'object'
          ? Array.isArray(requested)
            ? requested[0]
            : (requested.exact as string)
          : (requested ?? deviceId);
      source = { ...source, enabled: true, readyState: 'live', getSettings: () => ({ deviceId: nextId }) };
      listeners.get('restarted')?.();
    }),
    on: (event: string, callback: () => void) => listeners.set(event, callback),
    off: (event: string, callback: () => void) => {
      if (listeners.get(event) === callback) listeners.delete(event);
    },
    stop: vi.fn(),
  };
  return track;
}

async function startInputs() {
  const audio = restartableTrack('audio', 'mic-1');
  const video = restartableTrack('video', 'camera-1');
  mocks.enumerateDevices.mockResolvedValue([
    { kind: 'audioinput', deviceId: 'mic-1', groupId: 'audio', label: 'Mic 1' },
    { kind: 'audioinput', deviceId: 'mic-2', groupId: 'audio-2', label: 'Mic 2' },
    { kind: 'videoinput', deviceId: 'camera-1', groupId: 'video', label: 'Camera 1' },
    { kind: 'videoinput', deviceId: 'camera-2', groupId: 'video-2', label: 'Camera 2' },
  ]);
  mocks.createLocalTracks.mockResolvedValue([audio, video]);
  render(
    <DebateMediaSessionProvider>
      <MediaSessionHarness />
    </DebateMediaSessionProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));
  await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
  return { audio, video };
}

describe('input changes on existing LocalTracks', () => {
  it('switches only the selected kind and retains disabled tracks', async () => {
    const { audio, video } = await startInputs();
    audio.mediaStreamTrack.enabled = false;
    fireEvent.click(screen.getByRole('button', { name: 'Select mic' }));
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'mic-2' } }));
    await waitFor(() => expect(screen.getByTestId('preview-busy')).toHaveTextContent('false'));
    expect(audio.mediaStreamTrack.enabled).toBe(false);
    expect(video.restartTrack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Select camera' }));
    await waitFor(() => expect(video.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'camera-2' } }));
    expect(audio.restartTrack).toHaveBeenCalledTimes(1);
    expect(audio.stop).not.toHaveBeenCalled();
    expect(video.stop).not.toHaveBeenCalled();
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
  });

  it('retains a mute applied while the new microphone is still opening', async () => {
    const { audio } = await startInputs();
    const restart = audio.restartTrack.getMockImplementation()!;
    let finish!: () => void;
    audio.restartTrack.mockImplementationOnce(async options => {
      await new Promise<void>(resolve => {
        finish = resolve;
      });
      await restart(options);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Select mic' }));
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalled());
    audio.mediaStreamTrack.enabled = false;
    await act(async () => finish());
    expect(audio.mediaStreamTrack.enabled).toBe(false);
  });

  it('waits for an input restart before acquiring preview tracks', async () => {
    const { audio, video } = await startInputs();
    const restart = audio.restartTrack.getMockImplementation()!;
    let finish!: () => void;
    audio.restartTrack.mockImplementationOnce(async options => {
      audio.mediaStreamTrack.readyState = 'ended';
      await new Promise<void>(resolve => {
        finish = resolve;
      });
      await restart(options);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Select mic' }));
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledOnce());
    mocks.createLocalTracks.mockResolvedValueOnce([restartableTrack('audio', 'mic-2')]);
    fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    await act(async () => finish());
    await waitFor(() => expect(screen.getByTestId('preview-busy')).toHaveTextContent('false'));
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
    expect(audio.stop).not.toHaveBeenCalled();
    expect(video.stop).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'])(
    'stops a restart that has lost ownership after %s even if the session is unchanged',
    async outcome => {
      const { audio } = await startInputs();
      const restart = audio.restartTrack.getMockImplementation()!;
      let finish!: () => void;
      audio.restartTrack.mockImplementationOnce(async options => {
        await new Promise<void>(resolve => {
          finish = resolve;
        });
        if (outcome === 'failure') throw new Error('Capture interrupted');
        await restart(options);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Select mic' }));
      await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledOnce());
      const preview = screen.getByTestId('preview-stream').textContent;
      fireEvent.click(screen.getByRole('button', { name: 'Drop track ownership' }));
      await act(async () => finish());
      expect(audio.stop).toHaveBeenCalled();
      expect(screen.getByTestId('preview-stream')).toHaveTextContent(preview!);
    }
  );

  it('keeps replacement tracks when a stale acquisition finishes enumerating devices', async () => {
    const original = [restartableTrack('audio', 'old-mic'), restartableTrack('video', 'old-camera')];
    const replacement = [restartableTrack('audio', 'new-mic'), restartableTrack('video', 'new-camera')];
    let finishEnumeration!: (devices: MediaDeviceInfo[]) => void;
    mocks.enumerateDevices
      .mockReturnValueOnce(
        new Promise<MediaDeviceInfo[]>(resolve => {
          finishEnumeration = resolve;
        })
      )
      .mockResolvedValue([]);
    mocks.createLocalTracks.mockResolvedValueOnce(original).mockResolvedValueOnce(replacement);
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));
    await waitFor(() => expect(mocks.enumerateDevices).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Start other match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    const preview = screen.getByTestId('preview-stream').textContent;
    await act(async () => finishEnumeration([]));
    expect(screen.getByTestId('preview-stream')).toHaveTextContent(preview!);
    for (const track of replacement) expect(track.stop).not.toHaveBeenCalled();
  });

  it('keeps a newer camera choice after a simultaneous device fallback', async () => {
    const { audio, video } = await startInputs();
    const restart = audio.restartTrack.getMockImplementation()!;
    let finish!: () => void;
    audio.restartTrack.mockImplementationOnce(async options => {
      await new Promise<void>(resolve => {
        finish = resolve;
      });
      await restart(options);
    });
    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-2', groupId: 'audio-2', label: 'Mic 2' },
      { kind: 'videoinput', deviceId: 'camera-2', groupId: 'video-2', label: 'Camera 2' },
      { kind: 'videoinput', deviceId: 'camera-3', groupId: 'video-3', label: 'Camera 3' },
    ]);
    await fireDeviceChange();
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Select third camera' }));
    await act(async () => finish());
    await waitFor(() => expect(video.restartTrack).toHaveBeenCalledTimes(2));
    expect(video.restartTrack.mock.calls.map(call => call[0]?.deviceId)).toEqual([
      { exact: 'camera-2' },
      { exact: 'camera-3' },
    ]);
    expect(video.mediaStreamTrack.getSettings().deviceId).toBe('camera-3');
    expect(screen.getByTestId('selected-devices')).toHaveTextContent('mic-2/camera-3');
  });

  it('serializes rapid microphone choices so the last one wins', async () => {
    const { audio } = await startInputs();
    let finish!: () => void;
    audio.restartTrack.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select mic' }));
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Select third mic' }));
    expect(audio.restartTrack).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() => expect(audio.restartTrack).toHaveBeenLastCalledWith({ deviceId: { exact: 'mic-3' } }));
    expect(screen.getByTestId('selected-devices')).toHaveTextContent('mic-3/');
  });

  it.each(['audio', 'video'] as const)(
    'shows the actual %s device after an ideal selection silently falls back',
    async kind => {
      const { audio, video } = await startInputs();
      const track = kind === 'audio' ? audio : video;
      const restart = track.restartTrack.getMockImplementation()!;
      const actualId = kind === 'audio' ? 'mic-1' : 'camera-1';
      track.restartTrack.mockImplementationOnce(async () => restart({ deviceId: actualId }));
      fireEvent.click(screen.getByRole('button', { name: kind === 'audio' ? 'Select mic' : 'Select camera' }));
      await waitFor(() => expect(track.restartTrack).toHaveBeenCalledOnce());
      await waitFor(() => expect(screen.getByTestId('preview-busy')).toHaveTextContent('false'));
      expect(screen.getByTestId('selected-devices')).toHaveTextContent('mic-1/camera-1');
      expect(track.mediaStreamTrack.getSettings().deviceId).toBe(actualId);
    }
  );

  it('does not replace a newer microphone choice with an earlier silent fallback', async () => {
    const { audio } = await startInputs();
    const restart = audio.restartTrack.getMockImplementation()!;
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    audio.restartTrack
      .mockImplementationOnce(async () => {
        await new Promise<void>(resolve => {
          finishFirst = resolve;
        });
        await restart({ deviceId: 'mic-1' });
      })
      .mockImplementationOnce(async options => {
        await new Promise<void>(resolve => {
          finishSecond = resolve;
        });
        await restart(options);
      });
    fireEvent.click(screen.getByRole('button', { name: 'Select mic' }));
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Select third mic' }));
    await act(async () => finishFirst());
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('selected-devices')).toHaveTextContent('mic-3/');
    await act(async () => finishSecond());
    expect(screen.getByTestId('selected-devices')).toHaveTextContent('mic-3/');
  });

  it('recovers the previous microphone if the selected device fails', async () => {
    const { audio, video } = await startInputs();
    audio.restartTrack.mockRejectedValueOnce(new Error('Capture failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Select mic' }));
    await waitFor(() => expect(audio.restartTrack).toHaveBeenLastCalledWith({ deviceId: { exact: 'mic-1' } }));
    await waitFor(() => expect(screen.getByTestId('preview-error')).toHaveTextContent('microphone'));
    expect(screen.getByTestId('selected-devices')).toHaveTextContent('mic-1/camera-1');
    expect(video.restartTrack).not.toHaveBeenCalled();
  });

  it('does not mark an ended microphone ready after all recovery attempts fail, and retries only that kind', async () => {
    const { audio, video } = await startInputs();
    audio.restartTrack.mockImplementation(async () => {
      audio.mediaStreamTrack.readyState = 'ended';
      throw new Error('No microphone available');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Select mic' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('error'));
    expect(video.restartTrack).not.toHaveBeenCalled();
    expect(video.stop).not.toHaveBeenCalled();
    const replacement = restartableTrack('audio', 'mic-1');
    mocks.createLocalTracks.mockResolvedValueOnce([replacement]);
    fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    expect(mocks.createLocalTracks).toHaveBeenLastCalledWith({ audio: true, video: false });
    expect(video.stop).not.toHaveBeenCalled();
  });

  it('stops a restarted capture that finishes after release, and skips queued selections', async () => {
    const { audio } = await startInputs();
    let finish!: () => void;
    audio.restartTrack.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select mic' }));
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Select third mic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release match' }));
    await act(async () => finish());
    expect(audio.restartTrack).toHaveBeenCalledTimes(1);
    expect(audio.stop).toHaveBeenCalled();
    expect(screen.getByTestId('preview-stream')).toHaveTextContent('none');
  });

  it('does not reopen either track when an unrelated device is plugged in', async () => {
    const { audio, video } = await startInputs();
    await fireDeviceChange();
    expect(audio.restartTrack).not.toHaveBeenCalled();
    expect(video.restartTrack).not.toHaveBeenCalled();
  });

  it('refreshes preview and retains mute when LiveKit reacquires capture itself', async () => {
    const { audio } = await startInputs();
    const original = screen.getByTestId('preview-stream').textContent;
    audio.mediaStreamTrack.enabled = false;
    await act(async () => audio.restartTrack({ deviceId: 'mic-2' }));
    expect(screen.getByTestId('preview-stream').textContent).not.toBe(original);
    expect(audio.mediaStreamTrack.enabled).toBe(false);
  });

  it.each([
    ['audio', 'pending'],
    ['audio', 'failed'],
    ['video', 'pending'],
    ['video', 'failed'],
  ] as const)('follows an owned %s restart while adding the other input is %s', async (kind, phase) => {
    const track = restartableTrack(kind, 'original');
    mocks.createLocalTracks.mockResolvedValueOnce([track]);
    render(
      <DebateMediaSessionProvider>
        <MediaSessionHarness />
      </DebateMediaSessionProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    fireEvent.click(screen.getByRole('button', { name: kind === 'audio' ? 'Ensure mic only' : 'Ensure camera only' }));
    await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('ready'));
    track.mediaStreamTrack.enabled = false;
    let reject!: (error: Error) => void;
    mocks.createLocalTracks.mockReturnValueOnce(
      new Promise((_resolve, refuse) => {
        reject = refuse;
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ensure both' }));
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalledTimes(2));
    if (phase === 'failed') {
      await act(async () => reject(new Error('Other input unavailable')));
      await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('error'));
    }
    await act(async () => track.restartTrack({ deviceId: 'replacement' }));
    expect(screen.getByTestId('preview-devices')).toHaveTextContent(`${kind}:replacement`);
    expect(track.mediaStreamTrack.enabled).toBe(false);
    expect(track.stop).not.toHaveBeenCalled();
    if (phase === 'pending') {
      await act(async () => reject(new Error('Other input unavailable')));
      await waitFor(() => expect(screen.getByTestId('preview-state')).toHaveTextContent('error'));
      expect(screen.getByTestId('preview-devices')).toHaveTextContent(`${kind}:replacement`);
    }
  });

  it('recovers an ended track even when enumeration still reports the same device', async () => {
    const { audio, video } = await startInputs();
    audio.mediaStreamTrack.readyState = 'ended';
    await fireDeviceChange();
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'mic-1' } }));
    expect(video.restartTrack).not.toHaveBeenCalled();
  });

  it('follows a changed system default even though its device id stays default', async () => {
    const { audio, video } = await startInputs();
    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'default', groupId: 'built-in', label: 'Default microphone' },
      { kind: 'videoinput', deviceId: 'camera-1', groupId: 'video', label: 'Camera 1' },
    ]);
    await fireDeviceChange();
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledWith({ deviceId: 'default' }));
    audio.restartTrack.mockClear();
    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'default', groupId: 'headset', label: 'Default microphone' },
      { kind: 'videoinput', deviceId: 'camera-1', groupId: 'video', label: 'Camera 1' },
    ]);
    await fireDeviceChange();
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledWith({ deviceId: 'default' }));
    expect(video.restartTrack).not.toHaveBeenCalled();
  });

  it('moves a missing microphone to another input while leaving the camera alone', async () => {
    const { audio, video } = await startInputs();
    mocks.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-2', groupId: 'audio-2', label: 'Mic 2' },
      { kind: 'videoinput', deviceId: 'camera-1', groupId: 'video', label: 'Camera 1' },
    ]);
    await fireDeviceChange();
    await waitFor(() => expect(audio.restartTrack).toHaveBeenCalledWith({ deviceId: { exact: 'mic-2' } }));
    expect(video.restartTrack).not.toHaveBeenCalled();
    expect(mocks.createLocalTracks).toHaveBeenCalledTimes(1);
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

function MediaSessionHarness({ outputRoute }: { outputRoute?: (id: string) => Promise<unknown> } = {}) {
  const media = useDebateMediaSession();

  return (
    <>
      <div data-testid="preview-stream">{streamId(media.previewStream)}</div>
      <div data-testid="preview-devices">
        {media.previewStream
          ?.getTracks()
          .map(track => `${track.kind}:${track.getSettings?.().deviceId}`)
          .join(',')}
      </div>
      <div data-testid="session-key">{media.activeSessionKey ?? 'none'}</div>
      <div data-testid="join-choice">{JSON.stringify(media.joinChoiceRef.current)}</div>
      <button type="button" onClick={() => (media.joinChoiceRef.current = { micOn: true, cameraOn: false })}>
        Choose mic only
      </button>
      <div data-testid="preview-error">{media.previewError}</div>
      <div data-testid="preview-busy">{String(media.previewBusy)}</div>
      <div data-testid="selected-output">{media.selectedAudioOutputId}</div>
      <button type="button" onClick={() => media.changeAudioInput('mic-2')}>
        Select microphone
      </button>
      <div data-testid="preview-state">{media.previewState}</div>
      <div data-testid="audio-output-supported">{media.audioOutputSupported ? 'yes' : 'no'}</div>
      <button type="button" onClick={() => media.reportAudioOutputFailure('Earlier route failed')}>
        Report earlier route failure
      </button>
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
      <button
        type="button"
        onClick={() => {
          media.localTracksRef.current = [];
        }}
      >
        Drop track ownership
      </button>
      <button type="button" onClick={() => media.changeVideoInput('camera-3')}>
        Select third camera
      </button>
      <button type="button" onClick={() => media.changeAudioInput('mic-2')}>
        Select mic
      </button>
      <button type="button" onClick={() => media.changeAudioInput('mic-3')}>
        Select third mic
      </button>
      <button type="button" onClick={() => media.changeVideoInput('camera-2')}>
        Select camera
      </button>
      <button type="button" onClick={() => void media.changeAudioOutput('speaker-2', outputRoute)}>
        Select other speaker
      </button>
      <button type="button" onClick={() => void media.changeAudioOutput('speaker-1', outputRoute)}>
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
