import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import type { Entity } from '~/core/types';

import { claimCanonicalMetadata } from './claim-canonical';

const mocks = vi.hoisted(() => ({
  cachedFetchEntity: vi.fn(),
  cachedFetchEntityPage: vi.fn(),
}));

vi.mock('./cached-fetch-entity', () => ({
  cachedFetchEntity: mocks.cachedFetchEntity,
  cachedFetchEntityPage: mocks.cachedFetchEntityPage,
}));

const NAME = 'a126ca530c8e48d5b88882c734c38935';
const HIDDEN = '6ed78f16da324392b1c5376cd06ee0ca';
const RELATIONSHIPS = '224406e0de3c48d78ef12774111b8b2f';
const CLAIM = '0af30a95f81e4632a452ecd6aefdfc65';
// The GEO-3802 example: the claim lives in US Politics and Debates only holds a Topics link.
const US_POLITICS = '4582fbbee28a16589154f7e36f1ee3c5';
const DEBATES = '9284477c8fe746368698994e2e517b32';

function value(spaceId: string, propertyId = NAME, text = 'Billionaires should not exist') {
  return { property: { id: propertyId }, spaceId, value: text };
}

function claim(values: ReturnType<typeof value>[], spaces = [DEBATES, US_POLITICS]): Entity {
  return {
    id: CLAIM,
    spaces,
    types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
    values,
    relations: [],
  } as unknown as Entity;
}

describe('a space that marks the claim Hidden', () => {
  // Named in Relationships (hidden there, and the tie-break winner) and US Politics; linked from Debates.
  const entity = () =>
    claim(
      [value(RELATIONSHIPS), value(RELATIONSHIPS, HIDDEN, 'true'), value(US_POLITICS)],
      [DEBATES, US_POLITICS, RELATIONSHIPS]
    );

  it('is never the canonical, even as the tie-break winner', async () => {
    mocks.cachedFetchEntityPage.mockResolvedValue({ entity: claim([value(US_POLITICS)]) });
    mocks.cachedFetchEntity.mockResolvedValue(entity());

    expect(await claimCanonicalMetadata({ params: Promise.resolve({ id: US_POLITICS, entityId: CLAIM }) })).toEqual({
      alternates: { canonical: `https://www.geobrowser.io/space/${US_POLITICS}/${CLAIM}` },
    });
  });

  it('leaves no canonical when every copy is hidden', async () => {
    mocks.cachedFetchEntityPage.mockResolvedValue({ entity: claim([]) });
    mocks.cachedFetchEntity.mockResolvedValue(claim([value(US_POLITICS), value(US_POLITICS, HIDDEN, 'true')]));

    expect(await claimCanonicalMetadata({ params: Promise.resolve({ id: DEBATES, entityId: CLAIM }) })).toEqual({});
  });
});

describe('claimCanonicalMetadata', () => {
  const params = (spaceId: string) => Promise.resolve({ id: spaceId, entityId: CLAIM });

  beforeEach(() => {
    mocks.cachedFetchEntity.mockReset();
    mocks.cachedFetchEntityPage.mockReset();
  });

  it('names the home-space URL, with the tab, from any space', async () => {
    mocks.cachedFetchEntityPage.mockResolvedValue({ entity: claim([]) });
    mocks.cachedFetchEntity.mockResolvedValue(claim([value(US_POLITICS)]));

    expect(await claimCanonicalMetadata({ params: params(DEBATES), subPath: 'sources' })).toEqual({
      alternates: { canonical: `https://www.geobrowser.io/space/${US_POLITICS}/${CLAIM}/sources` },
    });
  });

  it('gives a claim named in two spaces one canonical URL', async () => {
    mocks.cachedFetchEntityPage.mockResolvedValue({ entity: claim([value(DEBATES)]) });
    mocks.cachedFetchEntity.mockResolvedValue(claim([value(US_POLITICS), value(DEBATES)]));

    const fromDebates = await claimCanonicalMetadata({ params: params(DEBATES) });
    const fromHome = await claimCanonicalMetadata({ params: params(US_POLITICS) });

    expect(fromDebates).toEqual(fromHome);
  });

  it('adds nothing for other entities or a failed read', async () => {
    const topic = { ...claim([]), types: [{ id: 'aaaabbbbccccddddeeeeffff00001111', name: 'Topic' }] } as Entity;
    mocks.cachedFetchEntityPage.mockResolvedValue({ entity: topic });
    expect(await claimCanonicalMetadata({ params: params(DEBATES) })).toEqual({});

    mocks.cachedFetchEntityPage.mockResolvedValue({ entity: claim([]) });
    mocks.cachedFetchEntity.mockRejectedValue(new Error('graph down'));
    expect(await claimCanonicalMetadata({ params: params(DEBATES) })).toEqual({});
  });
});
