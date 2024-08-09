import { atom, useAtomValue } from 'jotai';

import * as React from 'react';

import { isDeletedSelector, localTriplesAtom } from '../state/actions-store/actions-store';
import { StoredTriple } from '../state/actions-store/types';
import { store } from '../state/jotai-store';
import { Triple as ITriple } from '../types';
import { Triples } from '../utils/triples';

interface UseTriplesArgs {
  mergeWith?: ITriple[];
  selector?: (t: StoredTriple) => boolean;
}

const makeLocalActionsAtomWithSelector = ({ selector, mergeWith = [] }: UseTriplesArgs) => {
  return atom(get => {
    const localTriples = get(localTriplesAtom).filter(t => {
      return isDeletedSelector(t) && (selector ? selector(t) : true);
    });

    return Triples.merge(localTriples, mergeWith);
  });
};

export function useTriples(args: UseTriplesArgs) {
  return useAtomValue(React.useMemo(() => makeLocalActionsAtomWithSelector(args), [args]));
}

export function getTriples(args: UseTriplesArgs) {
  return store.get(makeLocalActionsAtomWithSelector(args));
}
