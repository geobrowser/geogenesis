import type { DebateLobbyGuestLobby, DebateLobbyView } from '../api';

/** A visitor without an account: no role, no powers, never connected. */
export type LobbyGuestViewer = {
  kind: 'guest';
  role: null;
  creator: false;
  hosting: false;
  reminded: false;
  voice_away_at: null;
  connected: false;
  stepped_out: false;
};

export type LobbyMemberViewer = DebateLobbyView['viewer'] & { kind: 'member' };

/**
 * The lobby as the page draws it, for either audience. Components shared with guests take this;
 * member-only ones take `DebateLobbyView`, which a guest's view only reaches through `isMemberView`.
 */
export type LobbyPageView = Omit<DebateLobbyView, 'viewer'> & { viewer: LobbyGuestViewer | LobbyMemberViewer };
export type MemberLobbyPageView = Omit<DebateLobbyView, 'viewer'> & { viewer: LobbyMemberViewer };

const GUEST_VIEWER: LobbyGuestViewer = {
  kind: 'guest',
  role: null,
  creator: false,
  hosting: false,
  reminded: false,
  voice_away_at: null,
  connected: false,
  stepped_out: false,
};

export function lobbyViewForGuest(lobby: DebateLobbyGuestLobby): LobbyPageView {
  return { ...lobby, viewer: GUEST_VIEWER };
}

export function lobbyViewForMember(view: DebateLobbyView): MemberLobbyPageView {
  return { ...view, viewer: { ...view.viewer, kind: 'member' } };
}

export function isMemberView(view: LobbyPageView): view is MemberLobbyPageView {
  return view.viewer.kind === 'member';
}
