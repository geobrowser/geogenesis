import { Value } from '../v2.types';

export const activeTriplesForEntityIdSelector = (entityId: string) => (value: Value) => {
  return value.entity.id === entityId && isNotDeletedSelector(value);
};

export const isNotDeletedSelector = (value: Value) => {
  return value.isDeleted === false;
};
