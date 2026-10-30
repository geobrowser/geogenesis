import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CallRecordingState } from '~/core/debates/api';
import type { LobbyPresenceState } from '~/core/debates/lobbies/hooks';
import type { LobbyPageView } from '~/core/debates/lobbies/lobby-view';

const mocks = vi.hoisted(() => ({ flag: false, connected: true }));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.flag }));
vi.mock('~/core/debates/lobbies/lobby-voice', () => ({ useLobbyVoiceStates: () => ({ connected: mocks.connected }) }));
vi.mock('~/core/debates/lobbies/lobby-header', () => ({ LobbyHeader: () => null }));
vi.mock('~/core/debates/lobbies/lobby-roster', () => ({ LobbyPeople: () => null }));
vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'u1' }));
vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => false }));
vi.mock('./call-screen-stage', () => ({ CallScreenStage: () => null }));
vi.mock('./recording/hooks', () => ({ useCallRecordingControl: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('~/partials/community-calls/pre-join', () => ({
  PreJoinDeviceCheck: ({ onJoin }: { onJoin: (choice: unknown) => void }) => (
    <button type="button" onClick={() => onJoin({ audioEnabled: true, videoEnabled: false })}>
      Join with these
    </button>
  ),
}));
// The shell draws what the call room hands it; voice is stood in by `preJoin` and `people`.
vi.mock('~/core/debates/lobbies/lobby-room-shell', () => ({
  LobbyRoomShell: (props: {
    belowHeader: React.ReactNode;
    people: React.ReactNode;
    voiceExtras: { preJoin: (join: () => void) => React.ReactNode };
  }) => (
    <>
      {props.belowHeader}
      {mocks.connected ? props.people : props.voiceExtras.preJoin(() => undefined)}
    </>
  ),
}));

const { CallRoom } = await import('./call-room');

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  mocks.flag = false;
  mocks.connected = true;
});

const RECORDING: CallRecordingState = {
  status: 'recording',
  started_at: '2026-10-27T15:02:10Z',
  started_by: 'u2',
  stopped_at: null,
  end_reason: null,
  can_start: false,
  published: false,
  duration_seconds: null,
};

function speaker(recording: CallRecordingState | null): LobbyPageView {
  return {
    lobby_id: 'call1',
    name: 'Weekly call',
    purpose: 'call',
    call: { space_id: 'space1', space_name: 'Crypto', started_by: null, recording },
    members: [],
    viewer: { kind: 'member', role: 'speaker', hosting: false, can_manage_recording: false },
  } as unknown as LobbyPageView;
}

function room(lobby: LobbyPageView) {
  return (
    <CallRoom
      lobby={lobby}
      state={{ status: 'joined' } as LobbyPresenceState}
      onRetry={vi.fn()}
      onLeave={vi.fn()}
      voice={{ connectionId: 'c', setVoiceConnected: vi.fn(), awayAt: null }}
      guestSession={{} as never}
      exitHref="/space/space1"
    />
  );
}

describe('CallRoom while recording, with the recording flag off', () => {
  it('shows the REC banner and asks before the stage', () => {
    render(room(speaker(RECORDING)));
    expect(screen.getByTestId('call-recording-bar')).toHaveTextContent('This call is being recorded');
    expect(screen.getByTestId('call-recording-prompt')).toBeInTheDocument();
  });

  it('tells someone already on stage when recording starts', () => {
    const { rerender } = render(room(speaker({ ...RECORDING, status: 'off' })));
    expect(screen.queryByTestId('call-recording-bar')).toBeNull();
    rerender(room(speaker(RECORDING)));
    expect(screen.getByText(/now being recorded/)).toBeInTheDocument();
    expect(screen.queryByTestId('call-recording-prompt')).toBeNull();
  });

  it('says so in the pre-join, and joining from it counts as the confirm', () => {
    mocks.connected = false;
    const { rerender } = render(room(speaker(RECORDING)));
    expect(screen.getByTestId('call-pre-join-recording')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Join with these' }));
    mocks.connected = true;
    rerender(room(speaker(RECORDING)));
    expect(screen.queryByTestId('call-recording-prompt')).toBeNull();
  });

  it('says nothing for a call that is not recording, or from geo-chat without recording', () => {
    const { rerender } = render(room(speaker({ ...RECORDING, status: 'off' })));
    expect(screen.queryByTestId('call-recording-bar')).toBeNull();
    rerender(room(speaker(null)));
    expect(screen.queryByTestId('call-recording-bar')).toBeNull();
    expect(screen.queryByTestId('call-recording-prompt')).toBeNull();
  });
});
