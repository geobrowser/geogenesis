import '@testing-library/jest-dom/vitest';
import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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
  useJoinDebateQueue: () => ({ mutate: mocks.joinMutate, isPending: false, error: null }),
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
      claims: [{ claim_entity_id: 'claim-1', viewer_waiting_position: null, active_match: null, active_debate: null }],
    };

    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: 'No' }));

    expect(mocks.joinMutate).toHaveBeenCalledWith({ claimId: 'claim-1', request: { position: true } });
    expect(mocks.joinMutate).toHaveBeenCalledWith({ claimId: 'claim-1', request: { position: false } });
  });
});
