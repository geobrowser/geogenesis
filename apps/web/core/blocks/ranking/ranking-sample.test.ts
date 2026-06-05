import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Row } from '~/core/types';

import { RANKING_SAMPLE_MY_ENTRY_LIMIT, getSampleMyRankingEntityIds } from './ranking-sample-global';

function row(entityId: string): Row {
  return {
    entityId,
    placeholder: false,
    columns: {
      [SystemIds.NAME_PROPERTY]: { name: entityId, slotId: SystemIds.NAME_PROPERTY, space: 'space-1' },
    },
  } as Row;
}

describe('getSampleMyRankingEntityIds', () => {
  it('returns up to five entity ids from filter rows', () => {
    const rows = Array.from({ length: 8 }, (_, index) => row(`entity-${index}`));

    expect(getSampleMyRankingEntityIds(rows)).toEqual(['entity-0', 'entity-1', 'entity-2', 'entity-3', 'entity-4']);
    expect(getSampleMyRankingEntityIds(rows).length).toBe(RANKING_SAMPLE_MY_ENTRY_LIMIT);
  });

  it('skips placeholder rows', () => {
    const rows = [{ entityId: 'skip', placeholder: true, columns: {} } as Row, row('keep-1'), row('keep-2')];

    expect(getSampleMyRankingEntityIds(rows)).toEqual(['keep-1', 'keep-2']);
  });
});
