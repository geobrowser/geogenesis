import { StoredTriple } from './types';

export const activeTriplesForEntityIdSelector = (entityId: string) => (triple: StoredTriple) => {
  return triple.entityId === entityId && triple.isDeleted === false;
};

export const isDeletedSelector = (triple: StoredTriple) => {
  return triple.isDeleted === false;
};
