import { SYSTEM_IDS } from '@geogenesis/sdk';

import * as React from 'react';

import { Cell } from '~/core/types';

type Mapping = {
  [slotId: string]: Cell;
};

/**
 * A relation pointing to a data block stores a mapping representing how
 * the data for the block maps to the layout of the block.
 *
 * Data blocks can be rendered in any arbitrary layout, such as a table,
 * a list, or a gallery. The mapping represents slots within the layout
 * where specific data should be rendered.
 *
 * Depending on the data mode (collection, query, or relations) the mapping
 * may or may not have a data selector representing what data should be
 * rendered in the UI slot.
 *
 * @TODO
 * - the mapping for a table view will be different than a list view
 *   or gallery view
 * - also the way the mapping is consumed in a specific type of data
 *   block will be different than how its consumed in other data blocks.
 *   e.g., a entities query will always match attribute id to column id,
 *   but a relations query will match depending on selectors.
 */
export function useMapping() {
  const mapping = React.useMemo((): Mapping => {
    return {
      [SYSTEM_IDS.NAME_ATTRIBUTE]: {
        columnId: SYSTEM_IDS.NAME_ATTRIBUTE,
        entityId: '',
        triples: [],
        relations: [],
        name: '',
      },
    };
  }, []);

  return {
    mapping,
  };
}

export function mappingToRows() {
  /**
   * Take each row, take each mapping, take each "slot" in the mapping
   * and map them into the Row structure.
   */
}
