import { describe, expect, it } from 'vitest';

import { normId } from '~/core/utils/norm-id';

import { buildExploreFeedRows, decodeExploreCardEntity } from './explore-card-item';

/**
 * The card query's own output, decoded (GEO-2859).
 *
 * The synthetic fixture beside this one asserts the *rule*; this asserts that
 * the rule survives the decoder, which is where the first attempt at this fix
 * went wrong twice. The node below is `ProfileExploreRows`' reply for
 * `55a58477…` on 18 Sep, trimmed to the fields the decode reads — a claim in two
 * spaces, typed in exactly one of them.
 */
const PERSONAL = 'cc31e40f74231d530f1b5d0fc1cd94d8';
const RELATIONSHIPS = '224406e0de3c48d78ef12774111b8b2f';

const NODE = {
  id: '55a58477798a4e4e971f2c7a3dcc10df',
  name: 'Age-gap relationships are fundamentally unhealthy and biologically unnatural',
  description: null,
  spaceIds: [PERSONAL, RELATIONSHIPS],
  createdAt: '1788802463',
  backlinks: { totalCount: 0 },
  types: [{ id: '96f859efa1ca4b229372c86ad58b694b', name: 'Claim' }],
  valuesList: [
    {
      spaceId: RELATIONSHIPS,
      property: {
        id: 'a126ca530c8e48d5b88882c734c38935',
        name: 'Name',
        dataTypeId: '9edb6fcce4544aa5861139d7f024c010',
        dataTypeName: 'Text',
        renderableTypeId: null,
        renderableTypeName: null,
        format: null,
        isType: null,
      },
      text: 'Age-gap relationships are fundamentally unhealthy and biologically unnatural',
      integer: null,
      float: null,
      boolean: null,
      point: null,
      time: null,
      language: null,
      unit: null,
      datetime: null,
      date: null,
      decimal: null,
      schedule: null,
      embedding: null,
    },
  ],
  relationsList: [
    {
      id: '699b395a5aab4f38b8861b73b1a30f38',
      spaceId: RELATIONSHIPS,
      position: null,
      verified: null,
      entityId: 'ab2dabba0e0a439d993d8e1ec19a5e86',
      fromEntity: {
        id: '55a58477798a4e4e971f2c7a3dcc10df',
        name: 'Age-gap relationships are fundamentally unhealthy and biologically unnatural',
      },
      toEntity: {
        id: '96f859efa1ca4b229372c86ad58b694b',
        name: 'Claim',
        types: [{ id: '522de6b3580b40e3afd02a5fb2512765' }],
        valuesList: [],
      },
      toSpaceId: null,
      type: { id: '8f151ba4de204e3c9cb499ddf96f48f1', name: 'Types' },
    },
  ],
};

describe('the real card node', () => {
  it('decodes at all', () => {
    expect(decodeExploreCardEntity(NODE)).not.toBeNull();
  });

  it('keeps both spaces and the space its Types relation was written in', () => {
    const entity = decodeExploreCardEntity(NODE)!;

    expect(entity.spaces.map(normId)).toEqual(expect.arrayContaining([normId(PERSONAL), normId(RELATIONSHIPS)]));
    expect(entity.relations.map(relation => normId(relation.spaceId))).toEqual([normId(RELATIONSHIPS)]);
  });

  it('renders in Relationships rather than the personal space that lists first', () => {
    const entity = decodeExploreCardEntity(NODE)!;
    const allowed = new Set([normId(PERSONAL), normId(RELATIONSHIPS)]);

    const [row] = buildExploreFeedRows([entity], allowed, new Set());

    expect(normId(row.spaceId)).toBe(normId(RELATIONSHIPS));
    // Which is the part the reader sees: no Claim type, no claim card, no
    // Agree/Disagree at all.
    expect(row.types.map(type => type.name)).toEqual(['Claim']);
  });
});
