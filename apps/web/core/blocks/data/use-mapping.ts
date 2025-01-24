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
 * Right now Geo Genesis supports Table, List, and Gallery layouts. The mapping
 * might be consumed differently depending on the view and the query mode:
 * - Relation query mode supports mapping data to specific UI slots for every
 *   view type.
 * - Table views for Entities and Collection query modes also support the mapping,
 *   but don't provide a data selector. Instead the keys of the mapping are used
 *   to determine which columns are rendered in the table.
 * - Lists and galleries for non-Relation query modes use a default value for
 *   each UI slot defined by code rather than the mapping. e.g., the name field
 *   of the entity is always rendered in the name slot in the List/Gallery.
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
