import { Triple } from '../types';

export const activeTriplesForEntityIdSelector = (entityId: string) => (triple: Triple) => {
  return triple.entityId === entityId && isNotDeletedSelector(triple);
};

export const isNotDeletedSelector = (triple: Triple) => {
  return triple.isDeleted === false;
};
