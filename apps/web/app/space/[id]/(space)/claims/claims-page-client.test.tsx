import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { Entity, Relation } from '~/core/types';

import { ClaimsPageClient } from './claims-page-client';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  nameSet: vi.fn(),
  relationSet: vi.fn(),
  setActiveSpace: vi.fn(),
  bumpReviewVersion: vi.fn(),
  setIsReviewOpen: vi.fn(),
  joinMutate: vi.fn(),
  leaveMutate: vi.fn(),
}));

let claims: Entity[] = [];
let featureEnabled = true;
let joinPending = false;
let lastQueryEntitiesOptions: unknown = null;
let debateClaimsResponse: { claims: unknown[] } = { claims: [] };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useDebatesEnabled: () => featureEnabled,
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateClaims: () => ({ data: debateClaimsResponse, error: null }),
  useJoinDebateQueue: () => ({ mutate: mocks.joinMutate, isPending: joinPending, error: null }),
  useLeaveDebateQueue: () => ({ mutate: mocks.leaveMutate, isPending: false, error: null }),
  useAcceptDebateMatch: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useDeclineDebateMatch: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="entity-response-buttons">Entity response buttons</div>,
}));

vi.mock('~/core/state/diff-store', () => ({
  useDiff: () => ({
    setActiveSpace: mocks.setActiveSpace,
    bumpReviewVersion: mocks.bumpReviewVersion,
    setIsReviewOpen: mocks.setIsReviewOpen,
  }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: (options: unknown) => {
    lastQueryEntitiesOptions = options;
    return { entities: claims, isLoading: false };
  },
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: {
      entities: { name: { set: mocks.nameSet } },
      relations: { set: mocks.relationSet },
    },
  }),
}));

vi.mock('~/design-system/select-entity-compact', () => ({
  SelectEntityCompact: ({ placeholder }: { placeholder: string }) => (
    <div data-testid={`selector-${placeholder}`}>{placeholder}</div>
  ),
}));

beforeEach(() => {
  claims = [];
  featureEnabled = true;
  joinPending = false;
  lastQueryEntitiesOptions = null;
  debateClaimsResponse = { claims: [] };
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('ClaimsPageClient', () => {
  it('queries Claim entities and renders the empty state', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByRole('heading', { name: 'Claims' })).toBeInTheDocument();
    expect(screen.getByText('No claims yet')).toBeInTheDocument();
    expect(lastQueryEntitiesOptions).toMatchObject({
      where: {
        spaces: [{ equals: 'space-1' }],
        types: [{ id: { equals: CLAIM_TYPE_ID } }],
      },
    });
  });

  it('stages a claim with Claim and Topics relations only', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
    fireEvent.change(screen.getByLabelText('Claim'), {
      target: { value: 'Public transit should be free' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Open proposal' }).closest('form')!);

    expect(mocks.nameSet).toHaveBeenCalledWith(expect.any(String), 'space-1', 'Public transit should be free');
    const relationTypes = mocks.relationSet.mock.calls.map(call => (call[0] as Relation).type.id);
    expect(relationTypes).toContain(SystemIds.TYPES_PROPERTY);
    expect(relationTypes).not.toContain('73609ae8644c4463a50a90a3ee585746');
    expect(relationTypes).not.toContain(TOPICS_PROPERTY_ID);
    expect(mocks.setIsReviewOpen).toHaveBeenCalledWith(true);
  });

  it('shows no readiness toggle until a refetch exposes the viewer response', () => {
    claims = [publishedClaim()];
    debateClaimsResponse = {
      claims: [debateClaim({ viewer_response: null })],
    };

    const { rerender } = render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByText('Respond before joining')).toBeInTheDocument();
    expect(screen.getByTestId('entity-response-buttons')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join debate' })).not.toBeInTheDocument();

    debateClaimsResponse = {
      claims: [debateClaim({ viewer_response: { position: true, position_label: 'Agree' } })],
    };
    rerender(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Join debate' }));

    expect(mocks.joinMutate).toHaveBeenCalledWith({ claimId: 'claim-1' });
  });

  it('renders backend response labels and one leave-readiness toggle', () => {
    claims = [publishedClaim()];
    debateClaimsResponse = {
      claims: [
        debateClaim({
          viewer_response: { position: true, position_label: 'Verify' },
          viewer_debate_ready: true,
          response_kind: 'veracity',
          online_choices: [
            {
              position: true,
              position_label: 'Verify',
              participant_count: 4,
              participants: [
                {
                  user_id: 'viewer-user',
                  profile_space_id: 'viewer-profile',
                  display_name: 'Current viewer',
                  avatar_cid: 'https://example.com/viewer.png',
                },
                {
                  user_id: 'other-user',
                  profile_space_id: 'other-profile',
                  display_name: 'Other participant',
                  avatar_cid: null,
                },
              ],
            },
            {
              position: false,
              position_label: 'Dispute',
              participant_count: 0,
              participants: [],
            },
          ],
        }),
      ],
    };

    render(<ClaimsPageClient spaceId="space-1" />);

    const verifyAvailability = screen.getByLabelText('Verify, 4 participants available');
    expect(within(verifyAvailability).getByTitle('Current viewer')).toBeInTheDocument();
    expect(within(verifyAvailability).getByTitle('Other participant')).toBeInTheDocument();
    expect(within(verifyAvailability).getByText('+2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dispute' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));
    expect(mocks.leaveMutate).toHaveBeenCalledWith({ claimId: 'claim-1' });
  });

  it('keeps readiness disabled while joining, unpublished, or matched', () => {
    const published = publishedClaim();
    claims = [published];
    debateClaimsResponse = {
      claims: [debateClaim()],
    };
    joinPending = true;

    const { rerender } = render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByRole('button', { name: 'Join debate' })).toBeDisabled();

    joinPending = false;
    claims = [
      {
        ...published,
        relations: [
          {
            type: { id: 'local-change', name: 'Local change' },
            isLocal: true,
            hasBeenPublished: false,
          } as Relation,
        ],
      },
    ];
    rerender(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByText('Publish this claim before starting a debate.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join debate' })).not.toBeInTheDocument();

    claims = [published];
    debateClaimsResponse = {
      claims: [debateClaim({ active_match: { id: 'match-1' } })],
    };
    rerender(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByText('Match found. Both speakers need to accept.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join debate' })).toBeDisabled();
  });
});

function publishedClaim(): Entity {
  return {
    id: 'claim-1',
    name: 'Public transit should be free',
    description: null,
    spaces: ['space-1'],
    types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
    values: [],
    relations: [],
  };
}

function debateClaim(overrides: Record<string, unknown> = {}) {
  return {
    id: 'debate-claim-1',
    space_id: 'space-1',
    claim_entity_id: 'claim-1',
    claim: 'Public transit should be free',
    description: null,
    response_kind: 'stance',
    viewer_response: { position: true, position_label: 'Agree' },
    viewer_debate_ready: false,
    readiness_disabled_reason: null,
    readiness_changed_at: null,
    online_choices: [],
    active_match: null,
    active_debate: null,
    created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}
