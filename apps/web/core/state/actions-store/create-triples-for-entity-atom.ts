import { atom } from 'jotai';

import { Triple } from '~/core/types';
import { Triples } from '~/core/utils/triples';

import { activeTriplesForEntityIdSelector, localTriplesAtom } from './actions-store';

export const createTriplesForEntityAtom = (initialTriples: Triple[], entityId: string) => {
  return atom(get => {
    const triplesForEntityId = get(localTriplesAtom).filter(activeTriplesForEntityIdSelector(entityId));
    return Triples.merge(triplesForEntityId, initialTriples);
  });
};
