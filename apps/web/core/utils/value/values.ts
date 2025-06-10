import { ID } from '~/core/id';
import type { Triple } from '~/core/types';
import { Value } from '~/core/v2.types';

export function stringValue(triple?: Triple) {
  if (!triple) return null;

  return triple.value.type === 'TEXT' ? triple.value.value : null;
}

export function merge(values: Value[], remoteValues: Value[]) {
  const localTripleIds = new Set(
    values.map(v => ID.createValueId({ spaceId: v.spaceId, entityId: v.entity.id, propertyId: v.property.id }))
  );
  const remoteTriplesWithoutLocalTriples = remoteValues.filter(
    v => !localTripleIds.has(ID.createValueId({ spaceId: v.spaceId, entityId: v.entity.id, propertyId: v.property.id }))
  );

  return [...remoteTriplesWithoutLocalTriples, ...values];
}
