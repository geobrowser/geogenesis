import { atom, useAtomValue } from 'jotai';

import * as React from 'react';

import { store } from '../state/jotai-store';
import { Triple as ITriple } from '../types';
import { Triples } from '../utils/triples';
import { isNotDeletedSelector } from './selectors';
import { StoredTriple } from './types';
import { localOpsAtom } from './write';

interface UseTriplesArgs {
  mergeWith?: ITriple[];
  selector?: (t: StoredTriple) => boolean;
}

const makeLocalActionsAtomWithSelector = ({ selector, mergeWith = [] }: UseTriplesArgs) => {
  return atom(get => {
    const localTriples = get(localOpsAtom).filter(t => {
      return isNotDeletedSelector(t) && (selector ? selector(t) : true);
    });

    const mergedTriples = Triples.merge(localTriples, mergeWith);
    return mergedTriples;
  });
};

export function useTriples(args?: UseTriplesArgs) {
  return useAtomValue(React.useMemo(() => makeLocalActionsAtomWithSelector(args ?? {}), [args]));
}

export function getTriples(args: UseTriplesArgs) {
  return store.get(makeLocalActionsAtomWithSelector(args));
}
