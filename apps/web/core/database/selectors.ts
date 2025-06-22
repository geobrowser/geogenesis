import { Value } from '../v2.types';

export const isNotDeletedSelector = (value: Value) => {
  return value.isDeleted === undefined || value.isDeleted === false;
};
