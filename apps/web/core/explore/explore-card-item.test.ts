import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { type ExploreCardEntity, buildExploreFeedRows, debateClaimFromRelations } from './explore-card-item';

const DEBATE_SPACE = '52c7ae149838b6d47ce0f3b2a5974546';
const OTHER_SPACE = 'aa11bb22cc33dd44ee55ff6677889900';
const CLAIM = 'Fast fashion should be discouraged with higher taxation';

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

describe('debateClaimFromRelations', () => {
  it('reads the claim off the debate’s Claims relation', () => {
    const claim = debateClaimFromRelations(
      relations({ typeId: DEBATE_CLAIMS_PROPERTY_ID, toEntity: { id: 'claim-1', name: CLAIM } })
    );

    expect(claim).toEqual({ entityId: 'claim-1', name: CLAIM });
  });

  it('matches the relation type regardless of id spelling', () => {
    // Ids reach the client hyphenated or not depending on the query that found them.
    const hyphenated = 'e614cce1-c4ce-4586-8304-fd1237119eb2';
    const claim = debateClaimFromRelations(relations({ typeId: hyphenated, toEntity: { id: 'claim-1', name: CLAIM } }));

    expect(claim).toEqual({ entityId: 'claim-1', name: CLAIM });
  });

  it('ignores every other relation on the entity', () => {
    const claim = debateClaimFromRelations(
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
    expect(debateClaimFromRelations(given)).toBeNull();
  });
});

function debateEntity(relationList: ExploreCardEntity['relations']): ExploreCardEntity {
  return {
    id: 'debate-1',
    name: `Ada vs. Blaise on ${CLAIM}`,
    description: null,
    spaces: [DEBATE_SPACE],
    types: [{ id: DEBATE_TYPE_ID, name: 'Debate' }],
    values: [],
    relations: relationList,
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
