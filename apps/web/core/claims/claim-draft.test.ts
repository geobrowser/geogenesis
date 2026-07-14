import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { describe, expect, it } from 'vitest';

import { buildClaimDraft } from './claim-draft';
import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from './ontology';

describe('buildClaimDraft', () => {
  it('creates a Claim entity with optional Topic relations', () => {
    let id = 0;
    const draft = buildClaimDraft(
      {
        spaceId: 'space-1',
        claimText: 'AI safety regulation should be strict',
        topics: [{ id: 'topic-1', name: 'AI' }],
      },
      {
        createEntityId: () => `id-${++id}`,
        createPosition: () => `pos-${id}`,
      }
    );

    expect(draft.claimId).toBe('id-1');
    expect(draft.names).toEqual([
      {
        entityId: 'id-1',
        spaceId: 'space-1',
        value: 'AI safety regulation should be strict',
      },
    ]);
    expect(draft.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
          fromEntity: { id: 'id-1', name: 'AI safety regulation should be strict' },
          toEntity: { id: CLAIM_TYPE_ID, name: 'Claim', value: CLAIM_TYPE_ID },
        }),
        expect.objectContaining({
          type: { id: TOPICS_PROPERTY_ID, name: 'Topics' },
          fromEntity: { id: 'id-1', name: 'AI safety regulation should be strict' },
          toEntity: { id: 'topic-1', name: 'AI', value: 'topic-1' },
        }),
      ])
    );
  });

  it('rejects empty claim text', () => {
    expect(() => buildClaimDraft({ spaceId: 'space-1', claimText: '   ' })).toThrow('Claim text is required.');
  });
});
