import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CallRecordingState } from '~/core/debates/api';
import type { LobbyPresenceState } from '~/core/debates/lobbies/hooks';
import type { LobbyPageView } from '~/core/debates/lobbies/lobby-view';

const mocks = vi.hoisted(() => ({ flag: false, connected: true, phone: false }));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => mocks.flag }));
vi.mock('~/core/debates/lobbies/lobby-voice', () => ({ useLobbyVoiceStates: () => ({ connected: mocks.connected }) }));
vi.mock('~/core/debates/lobbies/lobby-header', () => ({ LobbyHeader: () => null }));
vi.mock('~/core/debates/lobbies/lobby-roster', () => ({ LobbyPeople: () => null }));
vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'u1' }));
vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => mocks.phone }));
vi.mock('./call-screen-stage', () => ({ CallScreenStage: () => null }));
vi.mock('~/partials/space-chat/space-chat-panel', () => ({
  SpaceChatPanel: ({
    spaceId,
    roomId,
    subtitle,
    onArrival,
  }: {
    spaceId: string;
    roomId: string | null;
    subtitle?: React.ReactNode;
    onArrival?: () => void;
  }) => (
    <div data-testid="space-chat-panel" data-space={spaceId} data-room={roomId ?? ''}>
      {subtitle}
      <button type="button" onClick={onArrival}>
        Arrive
      </button>
    </div>
  ),
  SpaceChatAlsoPostsTo: ({ spaceId }: { spaceId: string }) => <span>Also posts to {spaceId}</span>,
}));
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
    aside?: { tab: string; mark: boolean; content: React.ReactNode };
    tab: 'people' | 'aside';
    onTab: (tab: 'people' | 'aside') => void;
    voiceExtras: { preJoin: (join: () => void) => React.ReactNode };
  }) => (
    <>
      {props.aside ? (
        <button type="button" onClick={() => props.onTab('aside')} data-mark={String(props.aside.mark)}>
          Chat tab
        </button>
      ) : null}
      {props.belowHeader}
      {mocks.connected ? props.people : props.voiceExtras.preJoin(() => undefined)}
      {props.aside ? <section aria-label={props.aside.tab}>{props.aside.content}</section> : null}
    </>
  ),
}));

const { CallRoom } = await import('./call-room');
const { RoomCapabilitiesProvider } = await import('~/core/debates/lobbies/room-capabilities');

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  mocks.flag = false;
  mocks.connected = true;
  mocks.phone = false;
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

describe('CallRoom chat (GEO-3422)', () => {
  const CALL_PURPOSE = { purpose: 'call' as const, spaceId: 'space1', exitHref: '/space/space1' };
  const withChatRoom = (lobby: LobbyPageView) =>
    ({ ...lobby, call: { ...lobby.call!, chat_room_id: 'room1' } }) as LobbyPageView;

  it('shows the space’s chat as the call’s Chat tab with the space chat flag on', () => {
    mocks.flag = true;
    render(
      <RoomCapabilitiesProvider purpose={CALL_PURPOSE}>{room(withChatRoom(speaker(null)))}</RoomCapabilitiesProvider>
    );
    const panel = screen.getByTestId('space-chat-panel');
    expect(panel).toHaveAttribute('data-space', 'space1');
    expect(panel).toHaveAttribute('data-room', 'room1');
    expect(screen.getByRole('region', { name: 'Chat' })).toContainElement(panel);
  });

  it('has no chat with the flag off', () => {
    render(
      <RoomCapabilitiesProvider purpose={CALL_PURPOSE}>{room(withChatRoom(speaker(null)))}</RoomCapabilitiesProvider>
    );
    expect(screen.queryByTestId('space-chat-panel')).toBeNull();
  });

  it('heads the in-call chat with where its messages also post', () => {
    mocks.flag = true;
    render(
      <RoomCapabilitiesProvider purpose={CALL_PURPOSE}>{room(withChatRoom(speaker(null)))}</RoomCapabilitiesProvider>
    );
    expect(screen.getByText('Also posts to space1')).toBeInTheDocument();
  });

  it('dots a phone’s Chat tab for a message that arrives off it, until the tab opens', () => {
    mocks.flag = true;
    mocks.phone = true;
    render(
      <RoomCapabilitiesProvider purpose={CALL_PURPOSE}>{room(withChatRoom(speaker(null)))}</RoomCapabilitiesProvider>
    );
    const tab = screen.getByRole('button', { name: 'Chat tab' });
    expect(tab).toHaveAttribute('data-mark', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Arrive' }));
    expect(tab).toHaveAttribute('data-mark', 'true');
    fireEvent.click(tab);
    expect(tab).toHaveAttribute('data-mark', 'false');
  });

  it('never dots the chat on a desktop, where it is always beside the people', () => {
    mocks.flag = true;
    render(
      <RoomCapabilitiesProvider purpose={CALL_PURPOSE}>{room(withChatRoom(speaker(null)))}</RoomCapabilitiesProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Arrive' }));
    expect(screen.getByRole('button', { name: 'Chat tab' })).toHaveAttribute('data-mark', 'false');
  });
});
