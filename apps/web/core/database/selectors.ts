import { StoredTriple } from './types';

export const activeTriplesForEntityIdSelector = (entityId: string) => (triple: StoredTriple) => {
  return triple.entityId === entityId && isDeletedSelector(triple);
};

export const isDeletedSelector = (triple: StoredTriple) => {
  return triple.isDeleted === false;
};
