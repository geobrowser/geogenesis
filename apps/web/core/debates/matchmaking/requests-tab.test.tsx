import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRequest, DebateRequestParty } from '../api';
import { RequestsTab } from './requests-tab';

const mocks = vi.hoisted(() => ({
  incoming: [] as DebateRequest[],
  outbound: null as DebateRequest | null,
  accept: vi.fn(),
  dismiss: vi.fn(),
  withdraw: vi.fn(),
  block: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useDebateActivity: () => ({ data: { challenge: null, outbound_request: null } }),
  useRejectDebateChallenge: () => ({ mutate: vi.fn(), isPending: false, error: null }),
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

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  getCurrentGeoChatUserId: () => 'user-me',
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

beforeEach(() => {
  mocks.incoming = [request('request-1', SPACE_A, 'Bitcoin will never go above $250K')];
  mocks.outbound = null;
  mocks.accept.mockReset();
  mocks.dismiss.mockReset();
  mocks.withdraw.mockReset();
  mocks.block.mockReset();

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
    render(<RequestsTab onTabChange={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Received' })).toBeInTheDocument();
    expect(screen.getByText('Bitcoin will never go above $250K')).toBeInTheDocument();
    expect(screen.getByText(/^Expires in/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  // "Not now" here is the real answer, unlike the popup's — it frees the request to advance.
  it('declines the request from the card', () => {
    render(<RequestsTab onTabChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(mocks.dismiss).toHaveBeenCalledWith({ requestId: 'request-1' });
  });

  it('separates the request you sent from the ones you received', () => {
    mocks.outbound = request('request-2', SPACE_A, 'Chips are better than fries');
    render(<RequestsTab onTabChange={vi.fn()} />);

    const sent = screen.getByRole('heading', { name: 'Sent' });
    const received = screen.getByRole('heading', { name: 'Received' });
    expect(sent.compareDocumentPosition(received) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Only the request you sent can be withdrawn, and only the ones you received can be accepted.
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1);
  });

  it('narrows to one side with the status filter', () => {
    mocks.outbound = request('request-2', SPACE_A, 'Chips are better than fries');
    render(<RequestsTab onTabChange={vi.fn()} />);

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
    render(<RequestsTab onTabChange={vi.fn()} />);

    openFilter('Any status');
    fireEvent.click(screen.getByRole('button', { name: 'Awaiting response' }));

    expect(await screen.findByText('No requests match these filters.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(await screen.findByText('Only in the other space')).toBeInTheDocument();
  });

  it('says where requests will show up when there are none', () => {
    mocks.incoming = [];
    render(<RequestsTab onTabChange={vi.fn()} />);

    expect(screen.getByText('Any debate requests you’ll receive will appear here.')).toBeInTheDocument();
  });

  it('shows both sides of a request and keeps blocking behind the overflow menu', () => {
    render(<RequestsTab onTabChange={vi.fn()} />);

    const parties = screen.getByText('Arturas').closest('div')!;
    expect(within(parties).getByText('No')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block Arturas' }));

    expect(mocks.block).toHaveBeenCalledWith('user-them');
  });
});
