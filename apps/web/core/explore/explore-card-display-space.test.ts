import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { normId } from '~/core/utils/norm-id';

import { type ExploreCardEntity, buildExploreFeedRows } from './explore-card-item';

/**
 * Which space's version of an entity a card renders: the top-ranked one
 * (GEO-2859).
 *
 * Reported three times on the same profile, and each earlier fix was a rule
 * invented for this path rather than the ranking the product already has:
 *
 *   1. "Read the space the person voted in" — they had answered that claim in
 *      *both* spaces, so the newest vote still landed on the untyped copy.
 *   2. "Prefer a space the entity is typed in" — correct as far as it went, but
 *      it left the vote preference narrowing the candidates to one space before
 *      this function could see them.
 *
 * The rule is `getTopRankedSpaceId`. `entity.spaces` is already rank-sorted and
 * looks like it answers this, but `sortSpaceIdsByRank` leaves equally-ranked ids
 * in incoming order and `SPACE_RANK` covers ten spaces — so nearly every real
 * pair ties and the first element is just "whatever the graph returned".
 *
 * Typing breaks ties the ranking table cannot: a personal space's name-only copy
 * of a claim renders a card that does not know it is a claim, because the feed's
 * dispatcher reads the types of the space it was handed.
 */
const CLAIM_TYPE = 'c1a1c1a1c1a1c1a1c1a1c1a1c1a1c1a1';
const PERSONAL = 'cc31e40f74231d530f1b5d0fc1cd94d8';
const TOPIC = '224406e0de1e40d9a0c4f6a2e4f3b1c7';

function entity(spaces: string[], typedIn: string[]): ExploreCardEntity {
  return {
    id: 'dbe3bd040add4c62ad0c57ef770f2563',
    name: 'Age-gap relationships are fundamentally unhealthy',
    description: null,
    spaces,
    types: [],
    values: [],
    relations: typedIn.map(spaceId => ({
      id: `rel-${spaceId}`,
      spaceId,
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      fromEntity: { id: 'dbe3bd040add4c62ad0c57ef770f2563', name: null },
      toEntity: { id: CLAIM_TYPE, name: 'Claim', value: '', type: 'ENTITY' },
      index: 'a0',
    })),
    commentCount: 0,
  } as unknown as ExploreCardEntity;
}

const rowFor = (e: ExploreCardEntity, allowed: string[]) =>
  buildExploreFeedRows([e], new Set(allowed.map(normId)), new Set())[0];

describe('the space a card renders in', () => {
  it('prefers a space the entity is actually typed in', () => {
    // `spaces` lists the untyped personal copy first, which is the whole bug.
    const row = rowFor(entity([PERSONAL, TOPIC], [TOPIC]), [PERSONAL, TOPIC]);

    expect(normId(row.spaceId)).toBe(normId(TOPIC));
  });

  it('carries that space’s types, which is what makes it a claim card', () => {
    const row = rowFor(entity([PERSONAL, TOPIC], [TOPIC]), [PERSONAL, TOPIC]);

    expect(row.types.map(type => type.name)).toEqual(['Claim']);
  });

  /*
   * Both ranked and both typed: the tie-break decides, and the point is that it
   * is *deterministic* rather than that it favours either id. `entity.spaces`
   * order must not settle it — that order is what put the personal copy first in
   * the first place, and it is re-partitioned on every store merge, so a winner
   * drawn from it changes between renders and takes the query keys derived from
   * it along with it.
   */
  it('breaks a tie the same way every time, not by the graph’s order', () => {
    const forwards = rowFor(entity([PERSONAL, TOPIC], [PERSONAL, TOPIC]), [PERSONAL, TOPIC]);
    const backwards = rowFor(entity([TOPIC, PERSONAL], [PERSONAL, TOPIC]), [PERSONAL, TOPIC]);

    expect(normId(forwards.spaceId)).toBe(normId(backwards.spaceId));
  });

  it('prefers a ranked space over an unranked one', () => {
    // Crypto is in SPACE_RANK; neither of the other two is.
    const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';
    const row = rowFor(entity([PERSONAL, CRYPTO], [PERSONAL, CRYPTO]), [PERSONAL, CRYPTO]);

    expect(normId(row.spaceId)).toBe(normId(CRYPTO));
  });

  /*
   * The caller's set still wins. Narrowing to a space is a request — a reader
   * who filtered to one space gets a card in it, typed or not — so this only
   * ever chooses *between* spaces the caller allowed.
   */
  it('does not leave the space the caller asked for', () => {
    const row = rowFor(entity([PERSONAL, TOPIC], [TOPIC]), [PERSONAL]);

    expect(normId(row.spaceId)).toBe(normId(PERSONAL));
  });

  it('still ranks when none of them is typed, rather than giving up', () => {
    const row = rowFor(entity([PERSONAL, TOPIC], []), [PERSONAL, TOPIC]);

    expect(normId(row.spaceId)).toBe(normId(TOPIC));
  });

  /*
   * Typing is only a tie-break. A *ranked* space wins even when the untyped one
   * is the typed candidate — the ranking table is the product's statement about
   * which space is canonical, and this function does not get to overrule it.
   */
  it('does not let typing beat the ranking table', () => {
    // The untyped candidate is the *ranked* one. Ranking still wins: a name-only
    // copy in a personal space must not outrank a canonical space that happens
    // to carry its types elsewhere.
    const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';
    const row = rowFor(entity([PERSONAL, CRYPTO], [PERSONAL]), [PERSONAL, CRYPTO]);

    expect(normId(row.spaceId)).toBe(normId(CRYPTO));
  });
});

/* GEO-3802: a claim named and typed in US Politics, listed by a Debates-scoped feed. */
describe('a claim the feed’s space only links to', () => {
  const US_POLITICS = '4582fbbee28a16589154f7e36f1ee3c5';
  const DEBATES = '9284477c8fe746368698994e2e517b32';
  const NAME = 'a126ca530c8e48d5b88882c734c38935';
  const CLAIM_TYPE_ID = '96f859efa1ca4b229372c86ad58b694b';
  const TITLE = 'Billionaires should not exist';

  function scopedClaim({
    valuesIn = [],
    types = [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
  }: {
    valuesIn?: string[];
    types?: { id: string; name: string }[];
  } = {}): ExploreCardEntity {
    return {
      id: '0af30a95f81e4632a452ecd6aefdfc65',
      name: TITLE,
      description: null,
      spaces: [DEBATES, US_POLITICS],
      types,
      // What a Debates-scoped feed query returns: only the lists' values in the feed's space.
      values: valuesIn.map(spaceId => ({ property: { id: NAME, name: 'Name' }, spaceId, value: TITLE })),
      relations: [],
      commentCount: 0,
      placement: {
        names: [US_POLITICS, ...valuesIn].map(spaceId => ({ spaceId, text: TITLE })),
        types: [US_POLITICS, ...valuesIn].map(spaceId => ({ spaceId, id: CLAIM_TYPE_ID, name: 'Claim' })),
      },
    } as unknown as ExploreCardEntity;
  }

  it('links and votes in the claim’s home space', () => {
    const row = rowFor(scopedClaim(), [DEBATES]);

    expect(normId(row.spaceId)).toBe(US_POLITICS);
  });

  it('renders as a claim, with its home space’s types and name', () => {
    const row = rowFor(scopedClaim(), [DEBATES]);

    expect(row.types).toEqual([{ id: CLAIM_TYPE_ID, name: 'Claim' }]);
    expect(row.title).toBe(TITLE);
  });

  it('stays in the feed’s space when the claim also lives there', () => {
    const row = rowFor(scopedClaim({ valuesIn: [DEBATES] }), [DEBATES]);

    expect(normId(row.spaceId)).toBe(DEBATES);
  });

  it('leaves entities that are not claims where the feed put them', () => {
    const row = rowFor(scopedClaim({ types: [{ id: 'aaaabbbbccccddddeeeeffff00001111', name: 'Topic' }] }), [DEBATES]);

    expect(normId(row.spaceId)).toBe(DEBATES);
  });

  it('still draws a claim card when its home names it but holds no Types relation', () => {
    const entity = scopedClaim();
    const nameOnlyHome = { ...entity, placement: { ...entity.placement!, types: [] } } as ExploreCardEntity;

    const row = rowFor(nameOnlyHome, [DEBATES]);

    expect(normId(row.spaceId)).toBe(US_POLITICS);
    expect(row.types).toEqual([{ id: CLAIM_TYPE_ID, name: 'Claim' }]);
  });

  it('keeps the Claim type when its home types it as something else too', () => {
    const entity = scopedClaim();
    const otherType = { spaceId: US_POLITICS, id: 'aaaabbbbccccddddeeeeffff00001111', name: 'Topic' };
    const row = rowFor({ ...entity, placement: { ...entity.placement!, types: [otherType] } } as ExploreCardEntity, [
      DEBATES,
    ]);

    expect(row.types.map(type => type.name)).toEqual(['Topic', 'Claim']);
  });

  it('stays put without the placement projection, rather than guessing', () => {
    const row = rowFor({ ...scopedClaim(), placement: undefined }, [DEBATES]);

    expect(normId(row.spaceId)).toBe(DEBATES);
  });
});

/* A feed space that names the claim beats a higher-ranked home outside the feed, which it could not label. */
describe('a claim named in another of the feed’s spaces', () => {
  const ROOT = 'a19c345ab9866679b001d7d2138d88a1';
  const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';
  const PERSONAL_NAMED = 'cc31e40f74231d530f1b5d0fc1cd94d8';
  const NAME = 'a126ca530c8e48d5b88882c734c38935';
  const CLAIM_TYPE_ID = '96f859efa1ca4b229372c86ad58b694b';

  // Linked from Root (ranked first), named in a personal space the feed covers and in Crypto, which
  // outranks it but is outside the feed.
  const claimEntity = {
    id: '0af30a95f81e4632a452ecd6aefdfc65',
    name: 'A claim',
    description: null,
    spaces: [ROOT, CRYPTO, PERSONAL_NAMED],
    types: [{ id: CLAIM_TYPE_ID, name: 'Claim' }],
    values: [{ property: { id: NAME, name: 'Name' }, spaceId: PERSONAL_NAMED, value: 'A claim' }],
    relations: [],
    commentCount: 0,
    placement: {
      names: [CRYPTO, PERSONAL_NAMED].map(spaceId => ({ spaceId, text: 'A claim' })),
      types: [CRYPTO, PERSONAL_NAMED].map(spaceId => ({ spaceId, id: CLAIM_TYPE_ID, name: 'Claim' })),
    },
  } as unknown as ExploreCardEntity;

  it('moves to the feed space that names it, not the higher-ranked one outside the feed', () => {
    const row = rowFor(claimEntity, [ROOT, PERSONAL_NAMED]);

    expect(normId(row.spaceId)).toBe(PERSONAL_NAMED);
  });

  it('falls back to the claim’s own home when no feed space names it', () => {
    const row = rowFor(claimEntity, [ROOT]);

    expect(normId(row.spaceId)).toBe(CRYPTO);
  });

  it('never moves to a space that marks the claim Hidden', () => {
    const hiddenInCrypto = {
      ...claimEntity,
      placement: { ...claimEntity.placement!, hiddenSpaceIds: [CRYPTO] },
    } as ExploreCardEntity;

    expect(normId(rowFor(hiddenInCrypto, [ROOT]).spaceId)).toBe(PERSONAL_NAMED);
  });

  it('stays put when every space that names the claim hides it', () => {
    const hiddenEverywhere = {
      ...claimEntity,
      placement: { ...claimEntity.placement!, hiddenSpaceIds: [CRYPTO, PERSONAL_NAMED] },
    } as ExploreCardEntity;

    expect(normId(rowFor(hiddenEverywhere, [ROOT]).spaceId)).toBe(ROOT);
  });

  it('skips a feed space that marks the claim Hidden for one that does not', () => {
    const hiddenInPersonal = {
      ...claimEntity,
      placement: { ...claimEntity.placement!, hiddenSpaceIds: [PERSONAL_NAMED] },
    } as ExploreCardEntity;

    expect(normId(rowFor(hiddenInPersonal, [ROOT, PERSONAL_NAMED]).spaceId)).toBe(CRYPTO);
  });
});
