import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateChallenge, DebateRequest, DebateRequestParty } from '../api';
import { RequestsTab } from './requests-tab';

const mocks = vi.hoisted(() => ({
  incoming: [] as DebateRequest[],
  outbound: null as DebateRequest | null,
  challenge: null as DebateChallenge | null,
  accept: vi.fn(),
  dismiss: vi.fn(),
  withdraw: vi.fn(),
  block: vi.fn(),
  acceptChallenge: vi.fn(),
  rejectChallenge: vi.fn(),
  currentUserId: 'user-me' as string | null,
}));

vi.mock('../hooks', () => ({
  useDebateActivity: () => ({ data: { challenge: mocks.challenge, outbound_request: null } }),
  useAcceptDebateChallenge: () => ({ mutate: mocks.acceptChallenge, isPending: false, error: null }),
  useRejectDebateChallenge: () => ({ mutate: mocks.rejectChallenge, isPending: false, error: null }),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-a', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('./hooks', () => ({
  useDebateRequests: () => ({
    data: { incoming: mocks.incoming, outbound: mocks.outbound },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAcceptDebateRequest: () => ({ mutate: mocks.accept, isPending: false, error: null }),
  useDismissDebateRequest: () => ({ mutate: mocks.dismiss, isPending: false, error: null }),
  useWithdrawDebateRequest: () => ({ mutate: mocks.withdraw, isPending: false, error: null }),
  useBlockDebateUser: () => ({ mutate: mocks.block, isPending: false, error: null }),
}));

// useSpaceLabels reads the browse sidebar's cache before falling back to the mock below. These
// suites render without a QueryClientProvider, so the read is stubbed as "nothing cached yet".
vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({
  useBrowseSidebarQuerySource: () => ({
    personalSpaceId: null,
    walletAddress: undefined,
    keyInput: null,
    isLoading: false,
  }),
  useCachedBrowseSidebarData: () => null,
}));

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  getCurrentGeoChatUserId: () => mocks.currentUserId,
  resolveCurrentGeoChatUserId: () => Promise.resolve(mocks.currentUserId),
}));

const SPACE_A = '019fedae-72b6-7ab2-927a-df044d57c566';
const SPACE_B = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';

function party(userId: string, displayName: string, position: boolean, label: string): DebateRequestParty {
  return {
    user_id: userId,
    profile_space_id: `profile-${userId}`,
    display_name: displayName,
    avatar_cid: null,
    online: true,
    available_to_debate: true,
    in_debate: false,
    online_since: '2026-08-05T11:00:00.000Z',
    position,
    position_label: label,
  };
}

function request(id: string, spaceId: string, claim: string): DebateRequest {
  return {
    id,
    status: 'pending',
    claim: { id: `row-${id}`, space_id: spaceId, claim_entity_id: `entity-${id}`, claim, description: null },
    requester: party('user-them', 'Arturas', false, 'No'),
    recipient: party('user-me', 'You', true, 'Yes'),
    turn_format_id: null,
    created_at: '2026-08-05T12:00:00.000Z',
    // Far enough out that `useUnexpiredRequests` keeps it, whatever the clock says.
    expires_at: '2099-01-01T00:00:00.000Z',
  };
}

function challenge(role: 'recipient' | 'requester'): DebateChallenge {
  const me = { user_id: 'user-me', profile_space_id: 'profile-me', display_name: 'You', avatar_cid: null };
  const them = { user_id: 'user-them', profile_space_id: 'profile-them', display_name: 'Arturas', avatar_cid: null };

  return {
    id: 'challenge-1',
    status: 'pending',
    source_space_id: SPACE_A,
    requester: role === 'recipient' ? them : me,
    recipient: role === 'recipient' ? me : them,
    rematch_session_id: null,
    created_at: '2026-08-05T12:00:00.000Z',
    expires_at: '2099-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  mocks.incoming = [request('request-1', SPACE_A, 'Bitcoin will never go above $250K')];
  mocks.outbound = null;
  mocks.challenge = null;
  mocks.currentUserId = 'user-me';
  mocks.accept.mockReset();
  mocks.dismiss.mockReset();
  mocks.withdraw.mockReset();
  mocks.block.mockReset();
  mocks.acceptChallenge.mockReset();
  mocks.rejectChallenge.mockReset();

  // Radix popovers measure their content; jsdom ships neither observer.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

const openFilter = (label: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));

describe('RequestsTab', () => {
  // The whole point of the popup's "Not now": the request is untouched, so it is still here with
  // its countdown for the rest of its 25-minute life.
  it('lists a request nobody has answered yet, with its countdown', () => {
    render(<RequestsTab />);

    expect(screen.getByRole('heading', { name: 'Received' })).toBeInTheDocument();
    expect(screen.getByText('Bitcoin will never go above $250K')).toBeInTheDocument();
    expect(screen.getByText(/^Expires in/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  // The card's answer is the real one, unlike the popup's "Not now" — it frees the request to
  // advance to the next candidate, which is why the two no longer share a label.
  it('declines the request from the card', () => {
    render(<RequestsTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(mocks.dismiss).toHaveBeenCalledWith({ requestId: 'request-1' });
  });

  it('separates the request you sent from the ones you received', () => {
    mocks.outbound = request('request-2', SPACE_A, 'Chips are better than fries');
    render(<RequestsTab />);

    const sent = screen.getByRole('heading', { name: 'Sent' });
    const received = screen.getByRole('heading', { name: 'Received' });
    expect(sent.compareDocumentPosition(received) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Only the request you sent can be withdrawn, and only the ones you received can be accepted.
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1);
    // Both sides run down the same 25-minute clock, so both say so — the sent one used to show
    // only "Awaiting response", with no hint of how long it had left.
    expect(screen.getAllByText(/^Expires in/)).toHaveLength(2);
  });

  it('narrows to one side with the status filter', () => {
    mocks.outbound = request('request-2', SPACE_A, 'Chips are better than fries');
    render(<RequestsTab />);

    openFilter('Any status');
    fireEvent.click(screen.getByRole('button', { name: 'Awaiting response' }));

    expect(screen.getByRole('heading', { name: 'Sent' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Received' })).not.toBeInTheDocument();
    expect(screen.queryByText('Bitcoin will never go above $250K')).not.toBeInTheDocument();
  });

  // `findBy` throughout: emptying the list crosses `HubQueryState`'s animated swap, so the old
  // content is still on screen for a frame after the filter changes.
  it('offers a way back when the filters hide everything', async () => {
    mocks.incoming = [request('request-1', SPACE_B, 'Only in the other space')];
    render(<RequestsTab />);

    openFilter('Any status');
    fireEvent.click(screen.getByRole('button', { name: 'Awaiting response' }));

    expect(await screen.findByText('No requests match these filters.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(await screen.findByText('Only in the other space')).toBeInTheDocument();
  });

  it('says where requests will show up when there are none', () => {
    mocks.incoming = [];
    render(<RequestsTab />);

    expect(screen.getByText('Any debate requests you’ll receive will appear here.')).toBeInTheDocument();
  });

  // A claimless challenge lands here too, so "Not now" in its popup is not the end of it.
  it('keeps a claimless challenge under Received, with its countdown', () => {
    mocks.incoming = [];
    mocks.challenge = challenge('recipient');
    render(<RequestsTab />);

    expect(screen.getByRole('heading', { name: 'Received' })).toBeInTheDocument();
    expect(screen.getByText('Someone wants to debate you')).toBeInTheDocument();
    expect(screen.getByText(/^Expires in/)).toBeInTheDocument();

    // Accepting is what opens the shared claim picker — switching tabs would leave it unanswered.
    fireEvent.click(screen.getByRole('button', { name: 'Explore claims' }));
    expect(mocks.acceptChallenge).toHaveBeenCalledWith('challenge-1');
  });

  it('files a challenge you sent under Sent, where you can cancel it', () => {
    mocks.incoming = [];
    mocks.challenge = challenge('requester');
    render(<RequestsTab />);

    expect(screen.getByRole('heading', { name: 'Sent' })).toBeInTheDocument();
    expect(screen.getByText('Waiting for a reply')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Explore claims' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(mocks.rejectChallenge).toHaveBeenCalledWith('challenge-1');
  });

  // Guessing the role from an absent id filed the challenge under Sent, which told the person it
  // was sent *to* that they had sent it, and offered them "Cancel request" instead of accepting.
  it('waits for the viewer id before deciding which side of a challenge they are on', async () => {
    mocks.incoming = [];
    mocks.currentUserId = null;
    mocks.challenge = challenge('recipient');
    render(<RequestsTab />);

    expect(screen.queryByRole('heading', { name: 'Sent' })).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for a reply')).not.toBeInTheDocument();

    // …and once it resolves, it lands under Received with the accept action.
    mocks.currentUserId = 'user-me';
    cleanup();
    render(<RequestsTab />);

    expect(await screen.findByRole('heading', { name: 'Received' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore claims' })).toBeInTheDocument();
  });

  it('shows both sides of a request and keeps blocking behind the overflow menu', () => {
    render(<RequestsTab />);

    const parties = screen.getByText('Arturas').closest('div')!;
    expect(within(parties).getByText('No')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block Arturas' }));

    expect(mocks.block).toHaveBeenCalledWith('user-them');
  });
});
