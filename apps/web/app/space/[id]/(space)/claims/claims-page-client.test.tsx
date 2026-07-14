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
  useFeatureFlag: (id: string) => {
    if (id !== 'questionsTab') throw new Error(`Unexpected feature flag: ${id}`);
    return featureEnabled;
  },
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateClaims: () => ({ data: debateClaimsResponse, error: null }),
  useJoinDebateQueue: () => ({ mutate: mocks.joinMutate, isPending: joinPending, error: null }),
  useAcceptDebateMatch: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useDeclineDebateMatch: () => ({ mutate: vi.fn(), isPending: false, error: null }),
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

  it('joins the claim queue with boolean Yes and No positions', () => {
    claims = [
      {
        id: 'claim-1',
        name: 'Public transit should be free',
        description: null,
        spaces: ['space-1'],
        types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
        values: [],
        relations: [],
      },
    ];
    debateClaimsResponse = {
      claims: [
        {
          claim_entity_id: 'claim-1',
          viewer_waiting_position: null,
          online_choices: [],
          active_match: null,
          active_debate: null,
        },
      ],
    };

    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Yes, 0 participants available' }));
    fireEvent.click(screen.getByRole('button', { name: 'No, 0 participants available' }));

    expect(mocks.joinMutate).toHaveBeenCalledWith({ claimId: 'claim-1', request: { position: true } });
    expect(mocks.joinMutate).toHaveBeenCalledWith({ claimId: 'claim-1', request: { position: false } });
  });

  it('renders online participants and highlights the viewer selected position', () => {
    claims = [
      {
        id: 'claim-1',
        name: 'Public transit should be free',
        description: null,
        spaces: ['space-1'],
        types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
        values: [],
        relations: [],
      },
    ];
    debateClaimsResponse = {
      claims: [
        {
          claim_entity_id: 'claim-1',
          viewer_waiting_position: true,
          online_choices: [
            {
              position: true,
              position_label: 'Yes',
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
              position_label: 'No',
              participant_count: 0,
              participants: [],
            },
          ],
          active_match: null,
          active_debate: null,
        },
      ],
    };

    render(<ClaimsPageClient spaceId="space-1" />);

    const yesButton = screen.getByRole('button', { name: 'Yes, 4 participants available, selected' });
    const noButton = screen.getByRole('button', { name: 'No, 0 participants available' });

    expect(yesButton.parentElement).toHaveClass('grid-cols-2');
    expect(yesButton).toHaveClass('rounded-full', 'bg-green');
    expect(yesButton).toHaveAttribute('aria-pressed', 'true');
    expect(yesButton).toBeDisabled();
    expect(noButton).not.toHaveClass('bg-green');
    expect(noButton).toHaveAttribute('aria-pressed', 'false');
    expect(noButton).toBeEnabled();
    expect(within(yesButton).getByTitle('Current viewer')).toBeInTheDocument();
    expect(within(yesButton).getByTitle('Other participant')).toBeInTheDocument();
    expect(within(yesButton).getByText('+2')).toBeInTheDocument();
    expect(within(yesButton).queryByRole('list')).not.toBeInTheDocument();
    expect(yesButton.querySelector('li')).not.toBeInTheDocument();
    expect(within(noButton).queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps position controls disabled while joining, unpublished, or matched', () => {
    const publishedClaim: Entity = {
      id: 'claim-1',
      name: 'Public transit should be free',
      description: null,
      spaces: ['space-1'],
      types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
      values: [],
      relations: [],
    };
    claims = [publishedClaim];
    debateClaimsResponse = {
      claims: [
        {
          claim_entity_id: 'claim-1',
          viewer_waiting_position: null,
          online_choices: [],
          active_match: null,
          active_debate: null,
        },
      ],
    };
    joinPending = true;

    const { rerender } = render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByRole('button', { name: 'Yes, 0 participants available' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'No, 0 participants available' })).toBeDisabled();

    joinPending = false;
    claims = [
      {
        ...publishedClaim,
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
    expect(screen.getByRole('button', { name: 'Yes, 0 participants available' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'No, 0 participants available' })).toBeDisabled();

    claims = [publishedClaim];
    debateClaimsResponse = {
      claims: [
        {
          claim_entity_id: 'claim-1',
          viewer_waiting_position: null,
          online_choices: [],
          active_match: { id: 'match-1' },
          active_debate: null,
        },
      ],
    };
    rerender(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByText('Match found. Both speakers need to accept.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, 0 participants available' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'No, 0 participants available' })).toBeDisabled();
  });
});
