import { SystemIds } from '@geoprotocol/geo-sdk';
import '@testing-library/jest-dom/vitest';
import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RECOMMENDED_CLAIMS_PARTICIPANTS_PROPERTY_ID,
  RECOMMENDED_CLAIMS_TYPE_ID,
  useRecommendedClaimSections,
} from './recommended-claims';

const CURATOR_SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';
const OTHER_SPACE = '019fedae72b67ab2927adf044d57c566';
const ME = '70a0a4ddda1057868ae4feebceaaacef';
const OPPONENT = 'f3dab79cb5a3d9d1759656dd5361d1c6';
const STRANGER = '019fedb11c417f3e9a112c7d5e8b4419';

const mocks = vi.hoisted(() => ({ pages: [] as unknown[], blocks: [] as unknown[] }));

// One query per stage: pages by type, then the blocks they point at.
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ where }: { where: Record<string, unknown> }) => ({
    entities: 'types' in where ? mocks.pages : mocks.blocks,
  }),
}));

function page({
  spaces = [CURATOR_SPACE],
  participants = [ME, OPPONENT],
  blockIds = ['block-1'],
}: { spaces?: string[]; participants?: string[]; blockIds?: string[] } = {}) {
  return {
    id: 'page-1',
    name: 'Recommended claims',
    spaces,
    types: [{ id: RECOMMENDED_CLAIMS_TYPE_ID }],
    relations: [
      ...participants.map((spaceId, index) => ({
        type: { id: RECOMMENDED_CLAIMS_PARTICIPANTS_PROPERTY_ID },
        toEntity: { id: spaceId },
        position: `a${index}`,
      })),
      ...blockIds.map((id, index) => ({
        type: { id: SystemIds.BLOCKS },
        toEntity: { id },
        position: `a${index}`,
      })),
    ],
  };
}

function block(id: string, name: string, claimIds: string[], positions?: string[]) {
  return {
    id,
    name,
    spaces: [CURATOR_SPACE],
    relations: claimIds.map((claimId, index) => ({
      type: { id: SystemIds.COLLECTION_ITEM_RELATION_TYPE },
      toEntity: { id: claimId },
      position: positions?.[index] ?? `a${index}`,
    })),
  };
}

beforeEach(() => {
  mocks.pages = [page()];
  mocks.blocks = [block('block-1', 'Geopolitics & chips', ['claim-a', 'claim-b'])];
});

describe('useRecommendedClaimSections', () => {
  it('returns each block as a section of its collection items', () => {
    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current).toEqual([{ id: 'block-1', name: 'Geopolitics & chips', claimIds: ['claim-a', 'claim-b'] }]);
  });

  // A page curated for a different pairing that happens to include one debater is not a
  // recommendation for this debate.
  it('ignores a page that does not cover every debater', () => {
    mocks.pages = [page({ participants: [ME, STRANGER] })];

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current).toEqual([]);
  });

  // The type is not a permission — anyone could publish an entity of it.
  it('ignores a page published outside the curated spaces', () => {
    mocks.pages = [page({ spaces: [OTHER_SPACE] })];

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current).toEqual([]);
  });

  it('orders claims within a block by their position', () => {
    mocks.blocks = [block('block-1', 'Geopolitics & chips', ['claim-late', 'claim-early'], ['b0', 'a0'])];

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current[0]!.claimIds).toEqual(['claim-early', 'claim-late']);
  });

  it('drops a block with nothing in it rather than heading an empty section', () => {
    mocks.blocks = [block('block-1', 'Empty', [])];

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current).toEqual([]);
  });

  it('returns nothing before the session has participants', () => {
    const { result } = renderHook(() => useRecommendedClaimSections([]));

    expect(result.current).toEqual([]);
  });
});
