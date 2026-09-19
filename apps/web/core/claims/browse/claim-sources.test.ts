import { describe, expect, it } from 'vitest';

import { SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import type { Relation } from '~/core/types';

import { getClaimSources } from './claim-sources';

function relation({ id, sourceId, deleted = false }: { id: string; sourceId: string; deleted?: boolean }) {
  return {
    id,
    isDeleted: deleted,
    type: { id: SOURCES_PROPERTY_ID },
    toEntity: { id: sourceId, name: `Source ${sourceId}` },
  } as unknown as Relation;
}

describe('getClaimSources', () => {
  it('drops deleted sources and dedupes live targets in relation order', () => {
    const sources = getClaimSources([
      relation({ id: 'r1', sourceId: 'source-1' }),
      relation({ id: 'r2', sourceId: 'source-1' }),
      relation({ id: 'r3', sourceId: 'source-2', deleted: true }),
      relation({ id: 'r4', sourceId: 'source-3' }),
    ]);

    expect(sources).toEqual([
      { id: 'source-1', name: 'Source source-1' },
      { id: 'source-3', name: 'Source source-3' },
    ]);
  });
});
