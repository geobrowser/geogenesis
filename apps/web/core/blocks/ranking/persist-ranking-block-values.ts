import { RANKING_END_DATE_PROPERTY_ID, RANKING_START_DATE_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Mutator } from '~/core/sync/use-mutate';
import type { Value } from '~/core/types';

import { writeValue } from '~/partials/blocks/table/change-entry';

function upsertDateValue({
  storage,
  entityId,
  spaceId,
  propertyId,
  propertyName,
  isoDate,
  existing,
}: {
  storage: Mutator;
  entityId: string;
  spaceId: string;
  propertyId: string;
  propertyName: string;
  isoDate: string;
  existing: Value | null;
}) {
  if (!isoDate.trim()) {
    if (existing) storage.values.delete(existing);
    return;
  }

  writeValue(storage, entityId, spaceId, { id: propertyId, name: propertyName, dataType: 'DATE' }, isoDate, existing);
}

export function persistRankingBlockDateValues({
  storage,
  entityId,
  spaceId,
  startDate,
  endDate,
  existingValues,
}: {
  storage: Mutator;
  entityId: string;
  spaceId: string;
  startDate: string;
  endDate: string;
  existingValues: Value[];
}) {
  const findValue = (propertyId: string) =>
    existingValues.find(v => v.property.id === propertyId && v.spaceId === spaceId && !v.isDeleted) ?? null;

  upsertDateValue({
    storage,
    entityId,
    spaceId,
    propertyId: RANKING_START_DATE_PROPERTY_ID,
    propertyName: 'Start date',
    isoDate: startDate,
    existing: findValue(RANKING_START_DATE_PROPERTY_ID),
  });

  upsertDateValue({
    storage,
    entityId,
    spaceId,
    propertyId: RANKING_END_DATE_PROPERTY_ID,
    propertyName: 'End date',
    isoDate: endDate,
    existing: findValue(RANKING_END_DATE_PROPERTY_ID),
  });
}
