import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { DATA_BLOCK_DROPDOWNS_PROPERTY_ID } from './block-ontology-ids';
import { BLOCK_CONFIG_RELATION_TYPE_IDS, isBlockConfigRelationType } from './shown-column-relations';

describe('BLOCK_CONFIG_RELATION_TYPE_IDS', () => {
  // The diff pipeline (core/utils/diff/diff.ts) and the sync store's relation
  // dedupe both consume this list; a missing entry makes that config type's
  // changes vanish from grouped block diffs or lose dedupe priority. Guard
  // the full membership so adding a new block-config relation type without
  // registering it here fails loudly.
  it('contains every relation type that carries block view config', () => {
    expect(BLOCK_CONFIG_RELATION_TYPE_IDS).toEqual([
      SystemIds.PROPERTIES,
      SystemIds.SHOWN_COLUMNS,
      SystemIds.VIEW_PROPERTY,
      DATA_BLOCK_DROPDOWNS_PROPERTY_ID,
    ]);
  });

  it('isBlockConfigRelationType matches exactly the listed ids', () => {
    for (const id of BLOCK_CONFIG_RELATION_TYPE_IDS) {
      expect(isBlockConfigRelationType(id)).toBe(true);
    }
    expect(isBlockConfigRelationType(SystemIds.COLLECTION_ITEM_RELATION_TYPE)).toBe(false);
  });
});
