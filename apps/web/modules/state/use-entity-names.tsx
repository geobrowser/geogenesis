import { useTripleStore } from '../services';
import { useSharedObservable } from './hook';

export function useEntityNames() {
  const { entityNames$ } = useTripleStore();
  return useSharedObservable(entityNames$);
}
