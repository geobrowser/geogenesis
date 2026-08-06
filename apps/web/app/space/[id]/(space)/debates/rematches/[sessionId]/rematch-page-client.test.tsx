import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { StrictMode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { DebateRematchClaim, DebateRematchSession } from '~/core/debates/api';

import { DebateRematchPageClient } from './rematch-page-client';

const mocks = vi.hoisted(() => ({
  session: null as DebateRematchSession | null,
  claims: [] as DebateRematchClaim[],
  replace: vi.fn(),
  mutate: vi.fn(),
  acceptMutate: vi.fn(),
  rejectMutate: vi.fn(),
  responseKinds: [] as Array<'stance' | 'veracity' | null>,
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
  useCreateDebateRematchRequest: () => mutation(),
  useLeaveDebateRematch: () => mutation(),
  useAcceptDebateRematchRequest: () => mutation(mocks.acceptMutate),
  useRejectDebateRematchRequest: () => mutation(mocks.rejectMutate),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({
    entities: [
      {
        id: 'claim-more',
        name: 'A newly published claim',
        description: null,
        spaces: ['space-2'],
        relations: [
          { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-gov', name: 'Governance' }, isDeleted: false },
          { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-eth', name: 'Ethics' }, isDeleted: false },
        ],
      },
    ],
    isLoading: false,
    isPlaceholderData: false,
    endCursor: null,
    hasNextPage: false,
  }),
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: ({ responseKind }: { responseKind: 'stance' | 'veracity' | null }) => {
    mocks.responseKinds.push(responseKind);
    return <button type="button">Change response</button>;
  },
}));

function mutation(mutate = mocks.mutate) {
  return { mutate, mutateAsync: mutate, isPending: false, error: null };
}

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.mutate.mockReset();
  mocks.acceptMutate.mockReset();
  mocks.rejectMutate.mockReset();
  mocks.responseKinds.length = 0;
  mocks.session = session();
  mocks.claims = [sharedClaim()];
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

afterEach(cleanup);

describe('DebateRematchPageClient', () => {
  it('does not leave a browsing rematch during the Strict Mode effect rehearsal', async () => {
    render(
      <StrictMode>
        <DebateRematchPageClient sessionId="rematch-1" />
      </StrictMode>
    );

    expect(await screen.findByRole('heading', { name: 'A claim both participants chose' })).toBeInTheDocument();
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

  it('shows backend response labels and holder avatars without position-update controls', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    const sharedClaimCard = screen.getByRole('heading', { name: 'A claim both participants chose' }).closest('article');
    expect(sharedClaimCard).not.toBeNull();
    expect(within(sharedClaimCard!).getByLabelText('Agree response').querySelector('img, svg')).not.toBeNull();
    expect(within(sharedClaimCard!).getByLabelText('Disagree response').querySelector('img, svg')).not.toBeNull();
    expect(within(sharedClaimCard!).queryByRole('button', { name: 'Agree' })).not.toBeInTheDocument();
    expect(within(sharedClaimCard!).queryByRole('button', { name: 'Disagree' })).not.toBeInTheDocument();
  });

  it('shows response controls when the active responses are missing or on the same side', () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: true, position_label: 'Agree' },
        ],
      },
    ];

    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(
      screen.getByText('You both have the same response. Change yours to request this debate.')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Change response' })).toHaveLength(1);
    const syntheticClaimCard = screen.getByRole('heading', { name: 'A newly published claim' }).closest('article');
    expect(syntheticClaimCard).not.toBeNull();
    expect(within(syntheticClaimCard!).getByText('Respond before requesting')).toBeInTheDocument();
    expect(
      within(syntheticClaimCard!).getByText(
        'Response controls are unavailable while this claim is being prepared for rematches.'
      )
    ).toBeInTheDocument();
    expect(within(syntheticClaimCard!).queryByRole('button', { name: 'Change response' })).not.toBeInTheDocument();
    expect(mocks.responseKinds).toContain('stance');
    expect(mocks.responseKinds).not.toContain(null);
  });

  it('shows authoritative stance labels in the incoming request dialog and preserves rematch actions', () => {
    mocks.session = session({
      status: 'request_pending',
      request: {
        id: 'request-1',
        status: 'pending',
        claim: claimSummary('claim-shared', 'A claim both participants chose'),
        requester_user_id: 'user-remote',
        recipient_user_id: 'user-local',
        requester_position: false,
        requester_position_label: 'Disagree',
        recipient_position: true,
        recipient_position_label: 'Agree',
        response_kind: 'stance',
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    const { unmount } = render(<DebateRematchPageClient sessionId="rematch-1" />);

    const dialog = screen.getByRole('dialog', { name: 'A claim both participants chose' });
    expect(within(dialog).getByText('Debate request')).toBeInTheDocument();
    expect(within(dialog).getByText('You')).toBeInTheDocument();
    expect(within(dialog).getByText('Salina')).toBeInTheDocument();
    expect(within(dialog).getByText('VS')).toBeInTheDocument();
    expect(within(within(dialog).getByText('You').parentElement!).getByText('Agree')).toBeInTheDocument();
    expect(within(within(dialog).getByText('Salina').parentElement!).getByText('Disagree')).toBeInTheDocument();
    expect(within(dialog).getAllByText('1m')).toHaveLength(2);
    expect(within(dialog).getAllByText('45s')).toHaveLength(2);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(mocks.acceptMutate).toHaveBeenCalledWith('request-1');
    expect(mocks.rejectMutate).toHaveBeenCalledWith('request-1');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('falls back to Yes and No for legacy incoming requests without response metadata', () => {
    mocks.session = session({
      status: 'request_pending',
      request: {
        id: 'request-legacy',
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

    const dialog = screen.getByRole('dialog', { name: 'A claim both participants chose' });
    expect(within(within(dialog).getByText('You').parentElement!).getByText('Yes')).toBeInTheDocument();
    expect(within(within(dialog).getByText('Salina').parentElement!).getByText('No')).toBeInTheDocument();
  });

  it('disables debate requests while a rematch request is pending', () => {
    mocks.session = session({
      status: 'request_pending',
      request: {
        id: 'request-1',
        status: 'pending',
        claim: claimSummary('claim-shared', 'A claim both participants chose'),
        requester_user_id: 'user-local',
        recipient_user_id: 'user-remote',
        requester_position: true,
        requester_position_label: 'Agree',
        recipient_position: false,
        recipient_position_label: 'Disagree',
        response_kind: 'stance',
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('button', { name: 'Requesting...' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^(Agree|Disagree)$/ })).not.toBeInTheDocument();
  });

  it('explains when response changes cancel a rematch request', () => {
    mocks.session = session({
      request: {
        id: 'request-1',
        status: 'expired',
        claim: claimSummary('claim-shared', 'A claim both participants chose'),
        requester_user_id: 'user-local',
        recipient_user_id: 'user-remote',
        requester_position: true,
        requester_position_label: 'Agree',
        recipient_position: false,
        recipient_position_label: 'Disagree',
        response_kind: 'stance',
        cancellation_reason: 'claim_response_position_changed',
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(
      screen.getByText('This request was cancelled because the responses no longer oppose each other.')
    ).toBeInTheDocument();
  });

  it('filters to opponent-committed claims on the Debate now tab', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    // The opponent has taken a side on the shared claim but not the newly published one.
    expect(screen.getByRole('heading', { name: 'A claim both participants chose' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'A newly published claim' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Debate now/ }));

    expect(screen.getByRole('heading', { name: 'A claim both participants chose' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'A newly published claim' })).toBeNull();
  });

  it('shows the opponent-specific empty state when no claim is debate-ready', () => {
    mocks.claims = [];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Debate now/ }));

    expect(screen.getByText(/Salina hasn't responded yet/)).toBeInTheDocument();
  });

  it('narrows the list to the selected topic', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by topic' }), { target: { value: 'Governance' } });

    // Only the Governance-tagged published claim survives; the untagged shared claim drops out.
    expect(screen.getByRole('heading', { name: 'A newly published claim' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'A claim both participants chose' })).toBeNull();
  });

  it('matches the topic filter on any of a claim topics, not just the first', () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    // The published claim is tagged Governance and Ethics; filtering on the second still matches.
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by topic' }), { target: { value: 'Ethics' } });

    expect(screen.getByRole('heading', { name: 'A newly published claim' })).toBeInTheDocument();
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
    response_kind: 'stance',
    participants: [
      { user_id: 'user-local', position: true, position_label: 'Agree' },
      { user_id: 'user-remote', position: false, position_label: 'Disagree' },
    ],
    shared_preference: true,
    recently_rejected: false,
    previously_debated: false,
  };
}

function claimSummary(id: string, claim: string) {
  return { id, space_id: 'space-1', claim_entity_id: id, claim, description: null };
}
