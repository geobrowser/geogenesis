import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { StrictMode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRematchClaim, DebateRematchSession } from '~/core/debates/api';

import { DebateRematchPageClient } from './rematch-page-client';

const mocks = vi.hoisted(() => ({
  session: null as DebateRematchSession | null,
  claims: [] as DebateRematchClaim[],
  replace: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('~/core/debates/api', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/api')>();
  return { ...actual, getCurrentGeoChatUserId: () => 'user-local' };
});

vi.mock('~/core/debates/hooks', () => ({
  useDebateRematch: () => ({ data: mocks.session, isLoading: false, error: null }),
  useDebateRematchClaims: () => ({
    data: { claims: mocks.claims, excluded_claim_ids: ['claim-source'] },
    isLoading: false,
    error: null,
  }),
  useDebate: () => ({ data: { claim: { claim_entity_id: 'claim-source' } } }),
  useUpdateDebateRematchPosition: () => mutation(),
  useCreateDebateRematchRequest: () => mutation(),
  useLeaveDebateRematch: () => mutation(),
  useAcceptDebateRematchRequest: () => mutation(),
  useRejectDebateRematchRequest: () => mutation(),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({
    entities: [{ id: 'claim-more', name: 'A newly published claim', description: null, spaces: ['space-2'] }],
    isLoading: false,
    isPlaceholderData: false,
    endCursor: null,
    hasNextPage: false,
  }),
}));

function mutation() {
  return { mutate: mocks.mutate, mutateAsync: mocks.mutate, isPending: false, error: null };
}

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.mutate.mockReset();
  mocks.session = session();
  mocks.claims = [sharedClaim()];
});

afterEach(cleanup);

describe('DebateRematchPageClient', () => {
  it('does not leave a browsing rematch during the Strict Mode effect rehearsal', async () => {
    render(
      <StrictMode>
        <DebateRematchPageClient sessionId="rematch-1" />
      </StrictMode>
    );

    expect(await screen.findByRole('heading', { name: 'Rematch Salina' })).toBeInTheDocument();
    await new Promise(resolve => window.setTimeout(resolve, 0));
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('does not end a browsing rematch when the page unmounts', async () => {
    const { unmount } = render(<DebateRematchPageClient sessionId="rematch-1" />);

    unmount();
    await new Promise(resolve => window.setTimeout(resolve, 0));

    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('ends a browsing rematch only through the explicit leave action', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    expect(mocks.mutate).toHaveBeenCalledOnce();
  });

  it('pins shared preferences above additional published claims and enables opposing requests', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    const shared = screen.getByRole('heading', { name: 'A claim both participants chose' });
    const additional = screen.getByRole('heading', { name: 'A newly published claim' });
    expect(shared.compareDocumentPosition(additional) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Request debate' })[0]).toBeEnabled();
  });

  it('does not show participant avatars in claim position controls', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    const sharedClaimCard = screen.getByRole('heading', { name: 'A claim both participants chose' }).closest('article');
    expect(sharedClaimCard).not.toBeNull();
    expect(within(sharedClaimCard!).getByRole('button', { name: 'Yes' }).querySelector('img, svg')).toBeNull();
    expect(within(sharedClaimCard!).getByRole('button', { name: 'No' }).querySelector('img, svg')).toBeNull();
  });

  it('shows an incoming request with the snapshotted format details', () => {
    mocks.session = session({
      status: 'request_pending',
      request: {
        id: 'request-1',
        status: 'pending',
        claim: claimSummary('claim-shared', 'A claim both participants chose'),
        requester_user_id: 'user-remote',
        recipient_user_id: 'user-local',
        requester_position: false,
        recipient_position: true,
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('dialog', { name: 'A claim both participants chose' })).toBeInTheDocument();
    expect(screen.getAllByText('1m')).toHaveLength(2);
    expect(screen.getAllByText('45s')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('disables every claim card while a rematch request is pending', () => {
    mocks.session = session({
      status: 'request_pending',
      request: {
        id: 'request-1',
        status: 'pending',
        claim: claimSummary('claim-shared', 'A claim both participants chose'),
        requester_user_id: 'user-local',
        recipient_user_id: 'user-remote',
        requester_position: true,
        recipient_position: false,
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('button', { name: 'Requesting...' })).toBeDisabled();
    expect(
      screen.getAllByRole('button', { name: 'Request debate' }).every(button => button.hasAttribute('disabled'))
    ).toBe(true);
    expect(screen.getAllByRole('combobox').every(select => select.hasAttribute('disabled'))).toBe(true);
  });
});

function session(overrides: Partial<DebateRematchSession> = {}): DebateRematchSession {
  return {
    id: 'rematch-1',
    source_debate_id: 'debate-1',
    source_space_id: 'space-1',
    status: 'browsing',
    participants: [
      {
        user_id: 'user-local',
        profile_space_id: 'profile-local',
        display_name: 'You',
        avatar_cid: null,
        participant_slot: 1,
        consented_at: '2026-07-10T10:00:00.000Z',
      },
      {
        user_id: 'user-remote',
        profile_space_id: 'profile-remote',
        display_name: 'Salina',
        avatar_cid: null,
        participant_slot: 2,
        consented_at: '2026-07-10T10:00:01.000Z',
      },
    ],
    decision_expires_at: '2026-07-10T10:00:20.000Z',
    browsing_expires_at: null,
    request: null,
    converted_debate_id: null,
    recently_rejected_claim_ids: [],
    created_at: '2026-07-10T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:01.000Z',
    ...overrides,
  };
}

function sharedClaim(): DebateRematchClaim {
  return {
    claim: claimSummary('claim-shared', 'A claim both participants chose'),
    participants: [
      { user_id: 'user-local', position: true },
      { user_id: 'user-remote', position: false },
    ],
    shared_preference: true,
    recently_rejected: false,
    previously_debated: false,
  };
}

function claimSummary(id: string, claim: string) {
  return { id, space_id: 'space-1', claim_entity_id: id, claim, description: null };
}
