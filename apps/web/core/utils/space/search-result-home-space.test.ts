import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import type { SearchResult, SpaceEntity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { withClaimHomeSpaceFirst } from './search-result-home-space';

const CLAIM = '0af30a95f81e4632a452ecd6aefdfc65';
// The GEO-3802 example: named in US Politics, linked from Debates, which the API lists first.
const US_POLITICS = '4582fbbee28a16589154f7e36f1ee3c5';
const DEBATES = '9284477c8fe746368698994e2e517b32';

const space = (spaceId: string) => ({ id: spaceId, spaceId, name: spaceId }) as SpaceEntity;

function result(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: CLAIM,
    name: 'Billionaires should not exist',
    description: null,
    types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
    namesBySpace: { [US_POLITICS]: 'Billionaires should not exist' },
    spaces: [space(DEBATES), space(US_POLITICS)],
    ...overrides,
  };
}

const link = (r: SearchResult) => NavUtils.toEntity(r.spaces[0].spaceId, r.id);

describe('withClaimHomeSpaceFirst', () => {
  it('links a claim to the space that names it, not one that only links to it', () => {
    const moved = withClaimHomeSpaceFirst(result());

    expect(link(moved)).toBe(`/space/${US_POLITICS}/${CLAIM}`);
    expect(moved.spaces.map(s => s.spaceId)).toEqual([US_POLITICS, DEBATES]);
  });

  it('picks the top-ranked naming space, with the same tie-break as the canonical URL', () => {
    const named = result({ namesBySpace: { [US_POLITICS]: 'Billionaires should not exist', [DEBATES]: 'b' } });
    const homeFirst = result({ ...named, spaces: [space(US_POLITICS), space(DEBATES)] });

    expect(withClaimHomeSpaceFirst(named).spaces[0].spaceId).toBe(US_POLITICS);
    expect(withClaimHomeSpaceFirst(homeFirst)).toBe(homeFirst);
  });

  it('matches dashed and dashless space ids', () => {
    const dashed = '4582fbbe-e28a-1658-9154-f7e36f1ee3c5';
    const moved = withClaimHomeSpaceFirst(result({ namesBySpace: { [dashed]: 'Billionaires should not exist' } }));

    expect(moved.spaces[0].spaceId).toBe(US_POLITICS);
  });

  it('never moves a space that marks the claim Hidden to the front', () => {
    const named = { [US_POLITICS]: 'Billionaires should not exist', [DEBATES]: 'b' };
    // US Politics wins the tie-break, but hides the claim; Debates came first and stays first.
    const hidden = result({ namesBySpace: named, hiddenSpaceIds: [US_POLITICS] });

    expect(withClaimHomeSpaceFirst(hidden)).toBe(hidden);
  });

  it('moves a visible naming space ahead of a hidden first space', () => {
    const hidden = result({
      namesBySpace: { [US_POLITICS]: 'Billionaires should not exist', [DEBATES]: 'b' },
      spaces: [space(US_POLITICS), space(DEBATES)],
      hiddenSpaceIds: ['4582fbbe-e28a-1658-9154-f7e36f1ee3c5'],
    });

    expect(withClaimHomeSpaceFirst(hidden).spaces[0].spaceId).toBe(DEBATES);
  });

  it('leaves other entities, and claims with no naming space, as they came', () => {
    const topic = result({ types: [{ id: 'aaaabbbbccccddddeeeeffff00001111', name: 'Topic' }] });
    const unnamed = result({ namesBySpace: {} });

    expect(withClaimHomeSpaceFirst(topic)).toBe(topic);
    expect(withClaimHomeSpaceFirst(unnamed)).toBe(unnamed);
  });
});
