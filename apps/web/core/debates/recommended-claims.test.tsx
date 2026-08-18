import { SystemIds } from '@geoprotocol/geo-sdk';
import '@testing-library/jest-dom/vitest';
import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

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

const mocks = vi.hoisted(() => ({
  pages: [] as unknown[],
  blocks: [] as unknown[],
  items: [] as unknown[],
  loading: false,
  wheres: [] as Array<Record<string, unknown>>,
}));

// Three stages: pages by type, the blocks they point at, then the blocks' collection items. The
// two id lookups are told apart by which ids they ask for.
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ where }: { where: Record<string, unknown> }) => {
    mocks.wheres.push(where);
    if ('types' in where) return { entities: mocks.pages, isLoading: mocks.loading };
    const ids = (where.id as { in?: string[] } | undefined)?.in ?? [];
    const blocks = (mocks.blocks as Array<{ id: string }>).filter(block => ids.includes(block.id));
    return {
      entities:
        blocks.length > 0 ? blocks : (mocks.items as Array<{ id: string }>).filter(item => ids.includes(item.id)),
    };
  },
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

function claimEntity(id: string) {
  return { id, name: id, spaces: [CURATOR_SPACE], types: [{ id: CLAIM_TYPE_ID }], relations: [] };
}

function otherEntity(id: string) {
  return { id, name: id, spaces: [CURATOR_SPACE], types: [{ id: 'some-other-type' }], relations: [] };
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
  mocks.items = [claimEntity('claim-a'), claimEntity('claim-b')];
  mocks.loading = false;
  mocks.wheres.length = 0;
});

describe('useRecommendedClaimSections', () => {
  it('returns each block as a section of its collection items', () => {
    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current.sections).toEqual([
      { id: 'block-1', name: 'Geopolitics & chips', claimIds: ['claim-a', 'claim-b'] },
    ]);
  });

  // A page curated for a different pairing that happens to include one debater is not a
  // recommendation for this debate.
  it('ignores a page that does not cover every debater', () => {
    mocks.pages = [page({ participants: [ME, STRANGER] })];

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current.sections).toEqual([]);
  });

  // The type is not a permission — anyone could publish an entity of it.
  it('ignores a page published outside the curated spaces', () => {
    mocks.pages = [page({ spaces: [OTHER_SPACE] })];

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current.sections).toEqual([]);
  });

  // A collection holds whatever the curator dropped in it, but this tab feeds a claim picker.
  it('leaves out collection items that are not claims', () => {
    mocks.blocks = [block('block-1', 'Geopolitics & chips', ['claim-a', 'not-a-claim'])];
    mocks.items = [claimEntity('claim-a'), otherEntity('not-a-claim')];

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current.sections[0]!.claimIds).toEqual(['claim-a']);
  });

  it('drops a block whose items are all non-claims rather than heading an empty section', () => {
    mocks.blocks = [block('block-1', 'Nothing debatable', ['not-a-claim'])];
    mocks.items = [otherEntity('not-a-claim')];

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current.sections).toEqual([]);
  });

  it('hands back the claim entities so callers need not refetch them', () => {
    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current.claimEntities.map(claim => claim.id)).toEqual(['claim-a', 'claim-b']);
  });

  it('orders claims within a block by their position', () => {
    mocks.blocks = [block('block-1', 'Geopolitics & chips', ['claim-late', 'claim-early'], ['b0', 'a0'])];
    mocks.items = [claimEntity('claim-late'), claimEntity('claim-early')];

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current.sections[0]!.claimIds).toEqual(['claim-early', 'claim-late']);
  });

  it('drops a block with nothing in it rather than heading an empty section', () => {
    mocks.blocks = [block('block-1', 'Empty', [])];
    mocks.items = [];

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current.sections).toEqual([]);
  });

  // An absent index has to fall to the end, not to the front where an empty-string default puts it.
  it('sorts items without a position after the ones that have one', () => {
    mocks.blocks = [block('block-1', 'Geopolitics & chips', ['claim-unplaced', 'claim-placed'])];
    (mocks.blocks[0] as { relations: Array<{ position?: string }> }).relations[0]!.position = undefined;
    mocks.items = [claimEntity('claim-unplaced'), claimEntity('claim-placed')];

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current.sections[0]!.claimIds).toEqual(['claim-placed', 'claim-unplaced']);
  });

  // Anyone can publish this type, so a hundred unrelated entities could crowd a real page out of a
  // result capped before the source is checked.
  it('asks only for pages in the curated spaces', () => {
    renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    const pagesWhere = mocks.wheres.find(where => 'types' in where) as {
      OR?: Array<{ spaces?: Array<{ equals?: string }> }>;
    };
    expect(pagesWhere.OR?.map(branch => branch.spaces?.[0]?.equals)).toEqual([
      '8a4955bcd9d0fc0d8613f17f01de3b9f',
      CURATOR_SPACE,
    ]);
  });

  it('reports that it is still looking rather than that nothing is recommended', () => {
    mocks.loading = true;

    const { result } = renderHook(() => useRecommendedClaimSections([ME, OPPONENT]));

    expect(result.current.isLoading).toBe(true);
  });

  it('returns nothing before the session has participants', () => {
    const { result } = renderHook(() => useRecommendedClaimSections([]));

    expect(result.current.sections).toEqual([]);
  });
});
