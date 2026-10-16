/*
 * Redirect mock for `vi.mock('livekit-client')` with no factory. Each export delegates to
 * `globalThis.__liveKitClientMock`, which the test sets up from its own `vi.hoisted` mocks.
 *
 * Exists because a factory mock races: Vitest skips the mock for a dynamic import made while
 * another import of it from the same module is still running the factory, and that one gets the
 * real SDK. A redirect mock is resolved without that window.
 */
type LiveKitClientMock = {
  createLocalTracks: (...args: unknown[]) => unknown;
  supportsAudioOutputSelection: () => boolean;
  Room: new (options: unknown) => unknown;
};

function liveKitMock(): LiveKitClientMock {
  const mock = (globalThis as { __liveKitClientMock?: LiveKitClientMock }).__liveKitClientMock;
  if (!mock) throw new Error('vi.mock("livekit-client") without a factory needs globalThis.__liveKitClientMock');
  return mock;
}

export const createLocalTracks = (...args: unknown[]) => liveKitMock().createLocalTracks(...args);

export const supportsAudioOutputSelection = () => liveKitMock().supportsAudioOutputSelection();

export class Room {
  constructor(options: unknown) {
    return new (liveKitMock().Room)(options) as Room;
  }
}

export const RoomEvent = {
  TrackSubscribed: 'trackSubscribed',
  TrackUnsubscribed: 'trackUnsubscribed',
  ParticipantConnected: 'participantConnected',
  ParticipantDisconnected: 'participantDisconnected',
  Reconnecting: 'reconnecting',
  Reconnected: 'reconnected',
  Disconnected: 'disconnected',
};

// Mirrors the runtime shape of the protobuf numeric enum: forward name -> number entries plus
// reverse number -> name entries, so disconnectReasonName's reverse-mapping filter is exercised.
export const DisconnectReason = {
  CLIENT_INITIATED: 1,
  DUPLICATE_IDENTITY: 2,
  SERVER_SHUTDOWN: 3,
  1: 'CLIENT_INITIATED',
  2: 'DUPLICATE_IDENTITY',
  3: 'SERVER_SHUTDOWN',
};
