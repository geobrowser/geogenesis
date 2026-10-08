import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyMember } from '../api';

const mocks = vi.hoisted(() => ({
  viewerId: 'viewer' as string | null,
  create: { mutate: vi.fn(), isPending: false, error: null as Error | null },
  cancel: { mutate: vi.fn(), isPending: false, error: null as Error | null },
  block: {
    outboundChallenge: null as { id: string; recipient: { user_id: string } } | null,
    blockedReason: null as string | null,
    buttonsDisabled: false,
  },
}));

vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => mocks.viewerId }));
vi.mock('../hooks', () => ({
  useCreateDebateChallenge: () => mocks.create,
  useRejectDebateChallenge: () => mocks.cancel,
  useDebateActivity: () => ({ data: undefined }),
}));
vi.mock('../matchmaking/hooks', () => ({ useDebateRequests: () => ({ data: undefined }) }));
vi.mock('../matchmaking/use-live-request-block', () => ({ useLiveRequestBlock: () => mocks.block }));

const { LobbyRequestDebate, canRequestLobbyMember } = await import('./lobby-request-debate');

function member(overrides: Partial<DebateLobbyMember> = {}): DebateLobbyMember {
  return {
    user_id: 'other',
    profile_space_id: 'space-other',
    display_name: 'Other',
    avatar_cid: null,
    role: 'listener',
    creator: false,
    acting_host: false,
    on_roster_since: '2026-10-06T10:00:00Z',
    stepped_out: false,
    in_debate: false,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.viewerId = 'viewer';
  mocks.create = { mutate: vi.fn(), isPending: false, error: null };
  mocks.cancel = { mutate: vi.fn(), isPending: false, error: null };
  mocks.block = { outboundChallenge: null, blockedReason: null, buttonsDisabled: false };
});

afterEach(cleanup);

describe('canRequestLobbyMember', () => {
  it('allows someone else who is in the room', () => {
    expect(canRequestLobbyMember(member(), 'viewer')).toBe(true);
  });

  it('never the viewer, matched across id spellings', () => {
    const id = '5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
    expect(canRequestLobbyMember(member({ user_id: id }), id.replaceAll('-', ''))).toBe(false);
  });

  it('not someone debating or stepped out, and not for a signed-out viewer', () => {
    expect(canRequestLobbyMember(member({ in_debate: true }), 'viewer')).toBe(false);
    expect(canRequestLobbyMember(member({ stepped_out: true }), 'viewer')).toBe(false);
    expect(canRequestLobbyMember(member(), null)).toBe(false);
  });
});

describe('LobbyRequestDebate', () => {
  it('sends a challenge to the member’s profile space', () => {
    render(<LobbyRequestDebate member={member()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Request a debate with Other' }));
    expect(mocks.create.mutate).toHaveBeenCalledWith({ recipient_profile_space_id: 'space-other' });
  });

  it('renders nothing for someone in a debate', () => {
    const { container } = render(<LobbyRequestDebate member={member({ in_debate: true })} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the pending label while sending', () => {
    mocks.create.isPending = true;
    render(<LobbyRequestDebate member={member()} />);
    expect(screen.getByRole('button', { name: 'Request a debate with Other' }).textContent).toBe('Requesting…');
  });

  it('shows the server’s refusal', () => {
    mocks.create.error = new Error('this person is already in a debate');
    render(<LobbyRequestDebate member={member()} />);
    expect(screen.getByRole('alert').textContent).toBe('this person is already in a debate');
  });

  it('greys out with the reason while another request is open', () => {
    mocks.block = { outboundChallenge: null, blockedReason: "You're already in a debate.", buttonsDisabled: true };
    render(<LobbyRequestDebate member={member()} />);
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Request a debate with Other' });
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("You're already in a debate.");
  });

  it('offers a cancel on the member the viewer already asked', () => {
    mocks.block = {
      outboundChallenge: { id: 'challenge-1', recipient: { user_id: 'other' } },
      blockedReason: null,
      buttonsDisabled: true,
    };
    render(<LobbyRequestDebate member={member()} />);
    screen.getByText('Awaiting response');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(mocks.cancel.mutate).toHaveBeenCalledWith('challenge-1');
  });
});
