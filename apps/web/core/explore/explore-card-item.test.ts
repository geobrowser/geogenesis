import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { type ExploreCardEntity, buildExploreFeedRows, debateClaimFromEntity } from './explore-card-item';

const DEBATE_SPACE = '52c7ae149838b6d47ce0f3b2a5974546';
const OTHER_SPACE = 'aa11bb22cc33dd44ee55ff6677889900';
const CLAIM = 'Fast fashion should be discouraged with higher taxation';
const TEXT_BLOCK_TYPE_ID = SystemIds.TEXT_BLOCK;

const debateTypes = [{ id: DEBATE_TYPE_ID, name: 'Debate' }];
const blockTypes = [{ id: TEXT_BLOCK_TYPE_ID, name: 'Text block' }];

type RelationFixture = {
  typeId: string;
  toEntity: { id: string; name: string | null };
  spaceId?: string;
  isDeleted?: boolean;
};

function relations(...specs: RelationFixture[]) {
  return specs.map((spec, index) => ({
    id: `relation-${index}`,
    entityId: `relation-entity-${index}`,
    type: { id: spec.typeId, name: null },
    fromEntity: { id: 'debate-1', name: 'Ada vs. Blaise' },
    toEntity: { ...spec.toEntity, value: '' },
    renderableType: 'RELATION',
    spaceId: spec.spaceId ?? DEBATE_SPACE,
    isDeleted: spec.isDeleted,
  })) as ExploreCardEntity['relations'];
}

describe('debateClaimFromEntity', () => {
  it('reads the claim off the debate’s Claims relation', () => {
    const claim = debateClaimFromEntity(
      debateTypes,
      relations({ typeId: DEBATE_CLAIMS_PROPERTY_ID, toEntity: { id: 'claim-1', name: CLAIM } })
    );

    expect(claim).toEqual({ entityId: 'claim-1', name: CLAIM });
  });

  it('matches the relation type regardless of id spelling', () => {
    // Ids reach the client hyphenated or not depending on the query that found them.
    const hyphenated = 'e614cce1-c4ce-4586-8304-fd1237119eb2';
    const claim = debateClaimFromEntity(
      debateTypes,
      relations({ typeId: hyphenated, toEntity: { id: 'claim-1', name: CLAIM } })
    );

    expect(claim).toEqual({ entityId: 'claim-1', name: CLAIM });
  });

  it('ignores every other relation on the entity', () => {
    const claim = debateClaimFromEntity(
      debateTypes,
      relations(
        { typeId: SystemIds.TYPES_PROPERTY, toEntity: { id: DEBATE_TYPE_ID, name: 'Debate' } },
        { typeId: DEBATE_CLAIMS_PROPERTY_ID, toEntity: { id: 'claim-1', name: CLAIM } }
      )
    );

    expect(claim).toEqual({ entityId: 'claim-1', name: CLAIM });
  });

  it.each([
    ['no relations at all', relations()],
    ['no Claims relation', relations({ typeId: SystemIds.TYPES_PROPERTY, toEntity: { id: 'x', name: 'Debate' } })],
    [
      'a deleted Claims relation',
      relations({ typeId: DEBATE_CLAIMS_PROPERTY_ID, toEntity: { id: 'claim-1', name: CLAIM }, isDeleted: true }),
    ],
    // Without a name there is no title, which is the whole reason the card asks — and the caller
    // has the debate's own name to fall back to.
    ['an unnamed claim', relations({ typeId: DEBATE_CLAIMS_PROPERTY_ID, toEntity: { id: 'claim-1', name: '   ' } })],
  ])('returns null for %s', (_label, given) => {
    expect(debateClaimFromEntity(debateTypes, given)).toBeNull();
  });

  /**
   * `Claims` is not a debate-only relation. `debate-publish-draft` writes it from the debate for
   * the motion, and again from every transcript text block for the claims extracted out of that
   * block's speech — so an entity carrying the relation is not evidence that it is a debate. A
   * block drawn as a card (a data block's explore view renders whatever its query returns) would
   * otherwise be re-headed and re-linked to one of those extracted claims.
   */
  describe('entities that are not debates', () => {
    const blockRelations = relations({
      typeId: DEBATE_CLAIMS_PROPERTY_ID,
      toEntity: { id: 'extracted-claim-1', name: 'Synthetic fibres shed microplastics' },
    });

    it('ignores the Claims relation on a transcript text block', () => {
      expect(debateClaimFromEntity(blockTypes, blockRelations)).toBeNull();
    });

    it('ignores it on an entity with no types at all', () => {
      expect(debateClaimFromEntity([], blockRelations)).toBeNull();
      expect(debateClaimFromEntity(undefined, blockRelations)).toBeNull();
    });

    // Multi-typed entities are ordinary, and the rule is "is a debate", not "is only a debate".
    it('still reads it on an entity typed debate and something else', () => {
      const claim = debateClaimFromEntity(
        [...blockTypes, ...debateTypes],
        relations({ typeId: DEBATE_CLAIMS_PROPERTY_ID, toEntity: { id: 'claim-1', name: CLAIM } })
      );

      expect(claim).toEqual({ entityId: 'claim-1', name: CLAIM });
    });
  });
});

/**
 * A published Debate as the feed decodes one.
 *
 * The Types relation is part of the fixture, not decoration: `buildExploreFeedRows` derives a row's
 * `types` from that relation *in the display space*, not from the entity's top-level `types`. So
 * the row's type tags and its `debateClaim` are read off the same source and cannot disagree —
 * anything `ExploreFeedCard` routes to the debate card is exactly what can carry a claim.
 */
function debateEntity(relationList: ExploreCardEntity['relations']): ExploreCardEntity {
  return {
    id: 'debate-1',
    name: `Ada vs. Blaise on ${CLAIM}`,
    description: null,
    spaces: [DEBATE_SPACE],
    types: [{ id: DEBATE_TYPE_ID, name: 'Debate' }],
    values: [],
    relations: [
      ...relations({ typeId: SystemIds.TYPES_PROPERTY, toEntity: { id: DEBATE_TYPE_ID, name: 'Debate' } }),
      ...relationList,
    ],
    commentCount: 0,
  } as unknown as ExploreCardEntity;
}

describe('buildExploreFeedRows', () => {
  it('carries the debated claim onto the row', () => {
    const [row] = buildExploreFeedRows(
      [debateEntity(relations({ typeId: DEBATE_CLAIMS_PROPERTY_ID, toEntity: { id: 'claim-1', name: CLAIM } }))],
      new Set([DEBATE_SPACE]),
      new Set()
    );

    expect(row.debateClaim).toEqual({ entityId: 'claim-1', name: CLAIM });
    // The row's own title stays the entity's name; choosing between them is the card's call.
    expect(row.title).toBe(`Ada vs. Blaise on ${CLAIM}`);
  });

  it('leaves it null on an entity with no Claims relation', () => {
    const [row] = buildExploreFeedRows([debateEntity(relations())], new Set([DEBATE_SPACE]), new Set());

    expect(row.debateClaim).toBeNull();
  });

  // The row-level half of the block guard above: a transcript text block reaching the feed keeps
  // its own name and its own link, however many extracted claims hang off it.
  it('leaves it null on a row that carries the relation but is not a debate', () => {
    const block = {
      id: 'block-1',
      name: 'Ada — synthetic fibres shed microplastics',
      description: null,
      spaces: [DEBATE_SPACE],
      types: [{ id: SystemIds.TEXT_BLOCK, name: 'Text block' }],
      values: [],
      relations: relations(
        { typeId: SystemIds.TYPES_PROPERTY, toEntity: { id: SystemIds.TEXT_BLOCK, name: 'Text block' } },
        { typeId: DEBATE_CLAIMS_PROPERTY_ID, toEntity: { id: 'extracted-claim-1', name: 'Extracted claim' } }
      ),
      commentCount: 0,
    } as unknown as ExploreCardEntity;

    const [row] = buildExploreFeedRows([block], new Set([DEBATE_SPACE]), new Set());

    expect(row.debateClaim).toBeNull();
    expect(row.title).toBe('Ada — synthetic fibres shed microplastics');
  });

  // Same scoping every other card field gets: a card drawn for one space must not title itself
  // from a relation someone wrote in another.
  it('ignores a Claims relation from outside the display space', () => {
    const [row] = buildExploreFeedRows(
      [
        debateEntity(
          relations({
            typeId: DEBATE_CLAIMS_PROPERTY_ID,
            toEntity: { id: 'claim-1', name: CLAIM },
            spaceId: OTHER_SPACE,
          })
        ),
      ],
      new Set([DEBATE_SPACE]),
      new Set()
    );

    expect(row.debateClaim).toBeNull();
  });
});
