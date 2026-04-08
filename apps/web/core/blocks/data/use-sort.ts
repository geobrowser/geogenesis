import * as React from 'react';

import { ID } from '~/core/id';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useMutate } from '~/core/sync/use-mutate';
import { useValues } from '~/core/sync/use-store';
import { SORT_PROPERTY } from '~/core/system-ids';
import { ColumnSortState } from '~/core/utils/column-sort';

import { useDataBlockInstance } from './use-data-block';

type PersistedSort = {
  sort_by: string;
  sort_direction: 'ascending' | 'descending';
};

function parseSortValue(raw: string | null): ColumnSortState {
  if (!raw) return null;
  try {
    const parsed: PersistedSort = JSON.parse(raw);
    if (!parsed.sort_by || !parsed.sort_direction) return null;
    return {
      columnId: parsed.sort_by,
      direction: parsed.sort_direction === 'ascending' ? 'asc' : 'desc',
    };
  } catch {
    return null;
  }
}

function toSortString(sort: ColumnSortState): string {
  if (!sort) return '';
  const persisted: PersistedSort = {
    sort_by: sort.columnId,
    sort_direction: sort.direction === 'asc' ? 'ascending' : 'descending',
  };
  return JSON.stringify(persisted);
}

export function useSort(canEdit?: boolean) {
  const { entityId, spaceId } = useDataBlockInstance();
  const { storage } = useMutate();

  const { initialBlockEntities } = useEditorStoreLite();
  const initialBlockEntity = React.useMemo(
    () => initialBlockEntities.find(b => b.id === entityId) ?? null,
    [initialBlockEntities, entityId]
  );

  const localSortValues = useValues({
    selector: v => v.entity.id === entityId && v.property.id === SORT_PROPERTY && v.spaceId === spaceId,
  });

  const sortTriple =
    localSortValues[0] ??
    initialBlockEntity?.values.find(v => v.property.id === SORT_PROPERTY && v.spaceId === spaceId) ??
    null;

  const persistedSortState = React.useMemo(() => {
    if (!sortTriple) return null;
    if (sortTriple.property.dataType === 'TEXT') {
      if (sortTriple.value === '') return null;
      return parseSortValue(sortTriple.value);
    }
    return null;
  }, [sortTriple]);

  const [temporarySortOverride, setTemporarySortOverride] = React.useState<ColumnSortState | undefined>(undefined);

  React.useEffect(() => {
    if (canEdit === true) {
      setTemporarySortOverride(undefined);
    }
  }, [canEdit]);

  const temporarySortState = temporarySortOverride !== undefined ? temporarySortOverride : persistedSortState;

  const setSortState = React.useCallback(
    (sort: ColumnSortState) => {
      const sortString = toSortString(sort);
      const entityName = initialBlockEntity?.name ?? '';

      storage.values.set({
        id: ID.createValueId({
          entityId,
          propertyId: SORT_PROPERTY,
          spaceId,
        }),
        spaceId,
        entity: {
          id: entityId,
          name: entityName,
        },
        property: {
          id: SORT_PROPERTY,
          name: 'Sort',
          dataType: 'TEXT',
        },
        value: sortString,
      });
    },
    [entityId, spaceId, initialBlockEntity?.name, storage.values]
  );

  const setTemporarySortState = React.useCallback((sort: ColumnSortState) => {
    setTemporarySortOverride(sort);
  }, []);

  const sortState = canEdit ? persistedSortState : temporarySortState;
  const setSort = canEdit ? setSortState : setTemporarySortState;

  return { sortState, setSortState: setSort };
}
