import { useTripleStore } from '../services';
import { EntityNames } from '../types';
import { useBehaviorSubject } from './hook';

export function useEntityNames() {
  const { entityNames$ } = useTripleStore();
  return useBehaviorSubject(entityNames$);
}
