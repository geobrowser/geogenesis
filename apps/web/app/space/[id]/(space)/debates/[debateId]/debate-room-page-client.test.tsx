import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { StrictMode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateRematchSession } from '~/core/debates/api';

import { DebateRoomPageClient } from './debate-room-page-client';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  consentMutateAsync: vi.fn(),
  leaveRematchMutateAsync: vi.fn(),
  enqueueRecording: vi.fn(),
  requestPersistentStorage: vi.fn(),
  estimateStorage: vi.fn(),
  mediaRecorderStart: vi.fn(),
  readyMutateAsync: vi.fn(),
  liveKitJoinMutateAsync: vi.fn(),
  markJoinedMutateAsync: vi.fn(),
  createLocalTracks: vi.fn(),
  roomConnect: vi.fn(),
  roomDisconnect: vi.fn(),
  publishTrack: vi.fn(),
  debate: null as Debate | null,
  rematch: null as DebateRematchSession | null,
  featureFlags: {
    questionsTab: true,
    debateDebugging: false,
  } as Record<string, boolean>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: string) => mocks.featureFlags[id] ?? false,
}));

vi.mock('~/core/debates/api', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/api')>();

  return {
    ...actual,
    getCurrentGeoChatUserId: () => 'user-a',
  };
});

vi.mock('~/core/debates/hooks', () => ({
  useAbortDebate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConsentToDebateRematch: () => ({ mutateAsync: mocks.consentMutateAsync, isPending: false }),
  useDebate: () => ({ data: mocks.debate, isLoading: false, error: null }),
  useDebateRematch: () => ({ data: mocks.rematch, isLoading: false, error: null }),
  useLeaveDebateRematch: () => ({ mutateAsync: mocks.leaveRematchMutateAsync, isPending: false }),
  useLiveKitJoin: () => ({ mutateAsync: mocks.liveKitJoinMutateAsync, isPending: false }),
  useMarkDebateJoined: () => ({ mutateAsync: mocks.markJoinedMutateAsync, isPending: false }),
  useMarkDebateReady: () => ({ mutateAsync: mocks.readyMutateAsync, isPending: false }),
}));

vi.mock('~/core/debates/recording-upload-queue', () => ({
  enqueueDebateRecordingUpload: mocks.enqueueRecording,
  estimateRecordingStorage: mocks.estimateStorage,
  isStorageQuotaError: (error: unknown) =>
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'QuotaExceededError',
  requestPersistentRecordingStorage: mocks.requestPersistentStorage,
}));

vi.mock('livekit-client', () => ({
  createLocalTracks: mocks.createLocalTracks,
  Room: class {
    localParticipant = {
      publishTrack: mocks.publishTrack,
    };

    on = vi.fn();
    connect = mocks.roomConnect;
    disconnect = mocks.roomDisconnect;
  },
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
  },
}));

beforeEach(() => {
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.consentMutateAsync.mockReset();
  mocks.leaveRematchMutateAsync.mockReset();
  mocks.enqueueRecording.mockReset();
  mocks.requestPersistentStorage.mockReset();
  mocks.estimateStorage.mockReset();
  mocks.mediaRecorderStart.mockReset();
  mocks.readyMutateAsync.mockReset();
  mocks.liveKitJoinMutateAsync.mockReset();
  mocks.markJoinedMutateAsync.mockReset();
  mocks.createLocalTracks.mockReset();
  mocks.roomConnect.mockReset();
  mocks.roomDisconnect.mockReset();
  mocks.publishTrack.mockReset();
  mocks.debate = completedDebate();
  mocks.rematch = null;
  mocks.featureFlags = {
    questionsTab: true,
    debateDebugging: false,
  };
  mocks.readyMutateAsync.mockResolvedValue(readyDebate({ localReady: true, remoteReady: false }));
  mocks.liveKitJoinMutateAsync.mockResolvedValue({
    token: 'livekit-token',
    url: 'wss://livekit.test',
    room_name: 'geo-debate-debate-1',
    role: 'participant',
    participant_slot: 1,
    position: true,
    position_label: 'Yes',
  });
  mocks.createLocalTracks.mockResolvedValue([
    { mediaStreamTrack: { kind: 'audio', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
  ]);
  mocks.roomConnect.mockResolvedValue(undefined);
  mocks.publishTrack.mockResolvedValue(undefined);
  mocks.enqueueRecording.mockResolvedValue(undefined);
  mocks.requestPersistentStorage.mockResolvedValue(true);
  mocks.estimateStorage.mockResolvedValue({ quota: 1_000_000_000, usage: 0 });
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(public tracks: Array<{ kind?: string }> = []) {}

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
      getUserMedia: vi.fn().mockResolvedValue(new MediaStream()),
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Shure MV7+' },
        { kind: 'audioinput', deviceId: 'mic-2', label: 'Studio Mic' },
        { kind: 'videoinput', deviceId: 'camera-1', label: 'HD Pro Webcam' },
        { kind: 'videoinput', deviceId: 'camera-2', label: 'Desk Camera' },
      ]),
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DebateRoomPageClient', () => {
  it('shows the pre-screen while the debate is waiting for readiness', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.getByRole('dialog', { name: 'Debate readiness' })).toBeInTheDocument();
    expect(screen.getByText('Debate')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The protocol should ship debates' })).toBeInTheDocument();
    expect(screen.getByText('Bri')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "I'm ready" })).toBeInTheDocument();
    expect(screen.getByText('Waiting...')).toBeInTheDocument();
    expect(screen.queryByText('Not ready')).not.toBeInTheDocument();
    expect(screen.queryByText('VS')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Debate recording' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.createLocalTracks).toHaveBeenCalled();
    });
    expect(mocks.requestPersistentStorage).toHaveBeenCalledOnce();
    expect(mocks.liveKitJoinMutateAsync).not.toHaveBeenCalled();
  });

  it('starts the camera preview after the Strict Mode effect rehearsal', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(
      <StrictMode>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </StrictMode>
    );

    await waitFor(() => expect(screen.queryByText('Starting camera...')).not.toBeInTheDocument());
    expect(document.querySelector('video')?.srcObject).toBeInstanceOf(MediaStream);
  });

  it('locks background scrolling while the pre-screen modal is open', () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    const { unmount } = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('lets participants choose microphone and camera devices from the pre-screen', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Select microphone' })).toHaveValue('mic-1');
    });
    expect(screen.getByRole('combobox', { name: 'Select camera' })).toHaveValue('camera-1');

    fireEvent.change(screen.getByRole('combobox', { name: 'Select microphone' }), { target: { value: 'mic-2' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Select camera' }), { target: { value: 'camera-2' } });

    await waitFor(() => {
      expect(mocks.createLocalTracks).toHaveBeenCalledWith({
        audio: { deviceId: 'mic-2' },
        video: { deviceId: 'camera-1' },
      });
    });
    await waitFor(() => {
      expect(mocks.createLocalTracks).toHaveBeenCalledWith({
        audio: { deviceId: 'mic-2' },
        video: { deviceId: 'camera-2' },
      });
    });
  });

  it('shows the opponent as ready while the local participant can still become ready', () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: true });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.getByText('Bri')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "I'm ready" })).toBeEnabled();
  });

  it('disables the ready button while waiting for the opponent', () => {
    mocks.debate = readyDebate({ localReady: true, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.getByRole('button', { name: 'Waiting...' })).toBeDisabled();
    expect(screen.getAllByText('Waiting...')).toHaveLength(2);
  });

  it('marks the local participant ready from the pre-screen', async () => {
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }));

    await waitFor(() => {
      expect(mocks.readyMutateAsync).toHaveBeenCalled();
    });
  });

  it('connects to LiveKit once the debate leaves the ready pre-screen', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'preparing',
      prepare_started_at: '2026-07-02T00:00:00.000Z',
      prepare_ends_at: '2026-07-02T00:00:30.000Z',
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => {
      expect(mocks.liveKitJoinMutateAsync).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mocks.markJoinedMutateAsync).toHaveBeenCalled();
    });
  });

  it('connects to LiveKit after the Strict Mode effect rehearsal', async () => {
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'preparing',
      prepare_started_at: '2026-07-02T00:00:00.000Z',
      prepare_ends_at: '2026-07-02T00:00:30.000Z',
    };

    render(
      <StrictMode>
        <DebateRoomPageClient spaceId="space-1" debateId="debate-1" />
      </StrictMode>
    );

    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());
  });

  it('stops preview tracks that resolve after the page unmounts', async () => {
    const tracks = [
      { mediaStreamTrack: { kind: 'audio', enabled: true }, stop: vi.fn(), detach: vi.fn() },
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ];
    const pendingTracks = deferred<typeof tracks>();
    mocks.createLocalTracks.mockReturnValue(pendingTracks.promise);
    mocks.debate = readyDebate({ localReady: false, remoteReady: false });

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.createLocalTracks).toHaveBeenCalled());
    view.unmount();
    pendingTracks.resolve(tracks);

    await waitFor(() => expect(tracks.every(track => track.stop.mock.calls.length === 1)).toBe(true));
  });

  it('disconnects a LiveKit room that connects after the page unmounts', async () => {
    const pendingConnection = deferred<void>();
    mocks.roomConnect.mockReturnValue(pendingConnection.promise);
    mocks.debate = {
      ...readyDebate({ localReady: true, remoteReady: true }),
      status: 'preparing',
      prepare_started_at: '2026-07-02T00:00:00.000Z',
      prepare_ends_at: '2026-07-02T00:00:30.000Z',
    };

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    await waitFor(() => expect(mocks.roomConnect).toHaveBeenCalled());
    view.unmount();
    pendingConnection.resolve();

    await waitFor(() => expect(mocks.roomDisconnect).toHaveBeenCalled());
    expect(mocks.markJoinedMutateAsync).not.toHaveBeenCalled();
  });

  it('shows the recording screen as stacked local and remote video tiles', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.000Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 1,
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The protocol should ship debates' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mute microphone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn camera off' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable audio' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave debate' })).toBeInTheDocument();
    expect(screen.queryByText(/has the floor/i)).not.toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'true');
    expect(
      document.querySelector('[data-inactive-speaker="remote"] [data-muted-indicator="true"]')
    ).toBeInTheDocument();
  });

  it('shows the yes participant above the no participant when the local participant chose no', async () => {
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 2,
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      participants: completedDebate().participants.map(participant => ({
        ...participant,
        position: participant.user_id === 'user-a' ? false : true,
        position_label: participant.user_id === 'user-a' ? 'No' : 'Yes',
      })),
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    const dialog = await screen.findByRole('dialog', { name: 'Debate recording' });
    const tiles = [...dialog.querySelectorAll('[data-debate-video-position]')];
    expect(tiles.map(tile => tile.getAttribute('data-debate-video-position'))).toEqual(['yes', 'no']);
    expect(tiles[0]?.querySelector('[data-inactive-speaker]')).toHaveAttribute('data-inactive-speaker', 'remote');
    expect(tiles[1]?.querySelector('[data-inactive-speaker]')).toHaveAttribute('data-inactive-speaker', 'local');
  });

  it('shows recording debug controls when debate debugging is enabled', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.000Z'));
    mocks.featureFlags.debateDebugging = true;
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 1,
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn camera off' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable audio' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Debate phases' })).toBeInTheDocument();
    expect(screen.getByText('Preparing').closest('li')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Preflight').closest('li')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Timed turn 1').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Timed turn 2').closest('li')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Thanking').closest('li')).not.toHaveAttribute('aria-current');
  });

  it('shows the circular phase timer during a timed debate turn', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:21.000Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 1,
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByLabelText('Phase timer: 19 seconds remaining')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(document.querySelector('circle[stroke="#ffffff"]')).toBeInTheDocument();
  });

  it('shows the circular phase timer during shared recording phases', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:05.000Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'preparing',
      current_turn_index: 0,
      current_speaker_slot: null,
      prepare_started_at: '2026-07-02T00:00:00.000Z',
      prepare_ends_at: '2026-07-02T00:00:30.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findAllByLabelText('Phase timer: 25 seconds remaining')).toHaveLength(2);
    expect(screen.getAllByText('25')).toHaveLength(2);
  });

  it('does not show the thank-you hint before the thanking phase when the local slot is unknown', async () => {
    mocks.liveKitJoinMutateAsync.mockReturnValue(deferred<never>().promise);
    mocks.debate = {
      ...completedDebate(),
      status: 'preparing',
      current_turn_index: 0,
      current_speaker_slot: null,
      prepare_started_at: '2026-07-02T00:00:00.000Z',
      prepare_ends_at: '2026-07-02T00:00:30.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByRole('dialog', { name: 'Debate recording' })).toBeInTheDocument();
    expect(
      screen.queryByText((_, element) => element?.textContent === 'Nice debate!Say thanks')
    ).not.toBeInTheDocument();
  });

  it('shows a large local countdown before the participant is up', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:29.500Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 2,
      current_turn_index: 0,
      current_speaker_slot: 2,
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:00.000Z',
      turn_ends_at: '2026-07-02T00:00:30.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText("You're up in")).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(document.querySelector('circle[stroke="#ff5c4f"]')).toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
  });

  it('shows GO when the local participant turn begins', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:30.500Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      current_turn_index: 0,
      current_speaker_slot: 1,
      started_at: '2026-07-02T00:00:30.000Z',
      turn_started_at: '2026-07-02T00:00:30.000Z',
      turn_ends_at: '2026-07-02T00:01:00.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('GO!')).toBeInTheDocument();
    expect(screen.queryByText("You're up in")).not.toBeInTheDocument();
  });

  it('advances directly from the warning to GO without waiting for a debate refresh', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:30.500Z'));
    const audioTrack = { mediaStreamTrack: { kind: 'audio', enabled: false }, stop: vi.fn(), detach: vi.fn() };
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 2,
      current_turn_index: 0,
      current_speaker_slot: 2,
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:00.000Z',
      turn_ends_at: '2026-07-02T00:00:30.000Z',
      completed_at: null,
    };

    const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('GO!')).toBeInTheDocument();
    expect(screen.queryByText("You're up in")).not.toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'true');
    await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(true));

    mocks.debate = {
      ...mocks.debate,
      current_turn_index: 1,
      current_speaker_slot: 1,
      turn_started_at: '2026-07-02T00:00:30.000Z',
      turn_ends_at: '2026-07-02T00:01:00.000Z',
    };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(screen.getByText('GO!')).toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(audioTrack.mediaStreamTrack.enabled).toBe(true);
  });

  it('advances from preflight to the first turn without waiting for a debate refresh', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:30.500Z'));
    mocks.debate = {
      ...completedDebate(),
      status: 'preflight',
      first_participant_slot: 1,
      current_turn_index: 0,
      current_speaker_slot: null,
      started_at: null,
      prepare_ends_at: '2026-07-02T00:00:20.000Z',
      preflight_ends_at: '2026-07-02T00:00:30.000Z',
      turn_started_at: null,
      turn_ends_at: null,
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('GO!')).toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
  });

  it('advances from the final turn to thanking without waiting for a debate refresh', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.500Z'));
    const audioTrack = { mediaStreamTrack: { kind: 'audio', enabled: false }, stop: vi.fn(), detach: vi.fn() };
    mocks.createLocalTracks.mockResolvedValue([
      audioTrack,
      { mediaStreamTrack: { kind: 'video', enabled: true }, stop: vi.fn(), detach: vi.fn() },
    ]);
    mocks.debate = {
      ...completedDebate(),
      status: 'in_progress',
      first_participant_slot: 1,
      current_turn_index: 1,
      current_speaker_slot: 2,
      turn_durations_ms: [10_000, 10_000],
      started_at: '2026-07-02T00:00:00.000Z',
      turn_started_at: '2026-07-02T00:00:10.000Z',
      turn_ends_at: '2026-07-02T00:00:20.000Z',
      completed_at: null,
    };

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(
      await screen.findByText((_, element) => element?.textContent === 'Nice debate!Say thanks')
    ).toBeInTheDocument();
    expect(document.querySelector('[data-inactive-speaker="local"]')).toHaveAttribute('data-visible', 'false');
    expect(document.querySelector('[data-inactive-speaker="remote"]')).toHaveAttribute('data-visible', 'false');
    await waitFor(() => expect(audioTrack.mediaStreamTrack.enabled).toBe(true));
  });

  it('does not restart completion work when revisiting an already-completed debate', async () => {
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Debate complete.')).toBeInTheDocument();
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();
    expect(screen.queryByText('Continue debating this claim?')).not.toBeInTheDocument();
  });

  it('shows rematch consent during thanking and records local consent', async () => {
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    mocks.debate = {
      ...completedDebate(),
      status: 'thanking',
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('deciding');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Debate again?')).toBeInTheDocument();
    expect(screen.getAllByText((_, element) => element?.textContent === 'Nice debate!Say thanks')).not.toHaveLength(0);
    expect(screen.getAllByLabelText('Phase timer: 20 seconds remaining')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(mocks.consentMutateAsync).toHaveBeenCalled());
  });

  it('disables rematch consent and shows waiting immediately after clicking yes', async () => {
    const consent = deferred<DebateRematchSession>();
    mocks.consentMutateAsync.mockReturnValue(consent.promise);
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    mocks.debate = {
      ...completedDebate(),
      status: 'thanking',
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('deciding');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));

    expect(await screen.findByRole('button', { name: 'Waiting...' })).toBeDisabled();
  });

  it('does not leave the rematch flow when the local recording cannot be persisted', async () => {
    mocks.debate = {
      ...completedDebate(),
      status: 'thanking',
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('deciding');

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Leave debate' }));

    expect(
      await screen.findByText('Could not save the local recording. Please try leaving again.')
    ).toBeInTheDocument();
    expect(mocks.leaveRematchMutateAsync).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('shows the thank-you hint only during the local participant half', async () => {
    installRecordingMocks();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:31.000Z'));
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());
    mocks.debate = {
      ...completedDebate(),
      status: 'thanking',
      turn_started_at: '2026-07-02T00:00:20.000Z',
      turn_ends_at: '2026-07-02T00:00:40.000Z',
      completed_at: null,
      rematch_session_id: 'rematch-1',
    };
    mocks.rematch = rematchSession('deciding');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(
      screen.queryByText((_, element) => element?.textContent === 'Nice debate!Say thanks')
    ).not.toBeInTheDocument();
  });

  it('waits for durable recording persistence before entering the rematch browser', async () => {
    const persistence = deferred<void>();
    mocks.enqueueRecording.mockReturnValue(persistence.promise);
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    mocks.rematch = rematchSession('browsing');
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalled());
    expect(mocks.enqueueRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        debateId: 'debate-1',
        blob: expect.any(Blob),
        mimeType: 'video/webm',
      })
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1');

    persistence.resolve();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
  });

  it('waits for a deciding rematch session to resolve before finalizing the completed debate', async () => {
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    mocks.rematch = rematchSession('deciding');
    mocks.debate = { ...completedDebate(), rematch_session_id: 'rematch-1' };
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(screen.getByText('Debate complete.')).toBeInTheDocument());
    expect(mocks.enqueueRecording).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalledWith('/space/space-1/debates');

    mocks.rematch = rematchSession('browsing');
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalled());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates/rematches/rematch-1'));
  });

  it('keeps the completion screen available when recording persistence fails', async () => {
    mocks.enqueueRecording.mockRejectedValue(new Error('Storage unavailable'));
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    mocks.debate = completedDebate();
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findAllByText('Storage unavailable')).not.toHaveLength(0);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('retains an in-memory recording after a quota failure and retries the same Blob', async () => {
    mocks.enqueueRecording.mockRejectedValueOnce(new DOMException('Storage full', 'QuotaExceededError'));
    installRecordingMocks();
    const view = await renderLiveDebate();
    await waitFor(() => expect(mocks.mediaRecorderStart).toHaveBeenCalled());

    mocks.debate = completedDebate();
    view.rerender(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(
      await screen.findByText(
        'There is not enough browser storage to save this recording. Free some device storage, then retry.'
      )
    ).toBeInTheDocument();
    const firstBlob = mocks.enqueueRecording.mock.calls[0]?.[0].blob;
    mocks.enqueueRecording.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));

    await waitFor(() => expect(mocks.enqueueRecording).toHaveBeenCalledTimes(2));
    expect(mocks.enqueueRecording.mock.calls[1]?.[0].blob).toBe(firstBlob);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/debates'));
  });
});

async function renderLiveDebate() {
  mocks.debate = {
    ...completedDebate(),
    status: 'in_progress',
    current_speaker_slot: 1,
    turn_started_at: '2026-07-02T00:00:10.000Z',
    turn_ends_at: '2026-07-02T00:00:40.000Z',
    completed_at: null,
  };
  const view = render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);
  await waitFor(() => expect(mocks.markJoinedMutateAsync).toHaveBeenCalled());
  return view;
}

function installRecordingMocks() {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-02T00:00:20.000Z'));
  vi.stubGlobal(
    'MediaRecorder',
    class extends EventTarget {
      static isTypeSupported() {
        return true;
      }

      state: RecordingState = 'inactive';
      mimeType = 'video/webm';
      ondataavailable: ((event: BlobEvent) => void) | null = null;

      start() {
        this.state = 'recording';
        mocks.mediaRecorderStart();
        this.dispatchEvent(new Event('start'));
      }

      requestData() {
        this.ondataavailable?.({ data: new Blob(['recording']) } as BlobEvent);
      }

      stop() {
        this.state = 'inactive';
        this.dispatchEvent(new Event('stop'));
      }
    }
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function completedDebate(): Debate {
  return {
    id: 'debate-1',
    claim: {
      id: 'debate-claim-1',
      space_id: 'space-1',
      claim_entity_id: 'claim-entity-1',
      claim: 'The protocol should ship debates',
      description: null,
    },
    status: 'complete',
    room_name: 'geo-debate-debate-1',
    first_participant_slot: 1,
    current_turn_index: 0,
    current_speaker_slot: null,
    prepare_started_at: null,
    prepare_ends_at: null,
    turn_started_at: null,
    turn_ends_at: null,
    preflight_ends_at: null,
    turn_format_id: 'standard',
    turn_durations_ms: [30_000, 30_000],
    created_at: '2026-07-02T00:00:00.000Z',
    started_at: '2026-07-02T00:00:10.000Z',
    completed_at: '2026-07-02T00:01:10.000Z',
    participants: [
      {
        user_id: 'user-a',
        profile_space_id: 'profile-a',
        display_name: 'Alex',
        avatar_cid: null,
        participant_slot: 1,
        position: true,
        position_label: 'Yes',
        joined_at: '2026-07-02T00:00:00.000Z',
        ready_at: '2026-07-02T00:00:00.000Z',
      },
      {
        user_id: 'user-b',
        profile_space_id: 'profile-b',
        display_name: 'Bri',
        avatar_cid: null,
        participant_slot: 2,
        position: false,
        position_label: 'No',
        joined_at: '2026-07-02T00:00:00.000Z',
        ready_at: '2026-07-02T00:00:00.000Z',
      },
    ],
    recordings: [],
    recording_error: null,
  };
}

function readyDebate({ localReady, remoteReady }: { localReady: boolean; remoteReady: boolean }): Debate {
  return {
    ...completedDebate(),
    status: 'ready',
    started_at: null,
    completed_at: null,
    participants: completedDebate().participants.map(participant => ({
      ...participant,
      joined_at: null,
      ready_at:
        participant.user_id === 'user-a'
          ? localReady
            ? '2026-07-02T00:00:00.000Z'
            : null
          : remoteReady
            ? '2026-07-02T00:00:00.000Z'
            : null,
    })),
  };
}

function rematchSession(status: DebateRematchSession['status']): DebateRematchSession {
  return {
    id: 'rematch-1',
    source_debate_id: 'debate-1',
    source_space_id: 'space-1',
    status,
    participants: [
      {
        user_id: 'user-a',
        profile_space_id: 'profile-a',
        display_name: 'Alex',
        avatar_cid: null,
        participant_slot: 1,
        consented_at: null,
      },
      {
        user_id: 'user-b',
        profile_space_id: 'profile-b',
        display_name: 'Bri',
        avatar_cid: null,
        participant_slot: 2,
        consented_at: null,
      },
    ],
    decision_expires_at: '2026-07-02T00:01:30.000Z',
    browsing_expires_at: null,
    request: null,
    converted_debate_id: null,
    recently_rejected_claim_ids: [],
    created_at: '2026-07-02T00:01:10.000Z',
    updated_at: '2026-07-02T00:01:10.000Z',
  };
}
