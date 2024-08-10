import { atom, useAtomValue } from 'jotai';

import * as React from 'react';

import { isDeletedSelector } from '../database/selectors';
import { StoredTriple } from '../database/types';
import { localOpsAtom } from '../database/write';
import { store } from '../state/jotai-store';
import { Triple as ITriple } from '../types';
import { Triples } from '../utils/triples';

interface UseTriplesArgs {
  mergeWith?: ITriple[];
  selector?: (t: StoredTriple) => boolean;
}

const makeLocalActionsAtomWithSelector = ({ selector, mergeWith = [] }: UseTriplesArgs) => {
  return atom(get => {
    const localTriples = get(localOpsAtom).filter(t => {
      return isDeletedSelector(t) && (selector ? selector(t) : true);
    });

    return Triples.merge(localTriples, mergeWith);
  });
};

export function useTriples(args?: UseTriplesArgs) {
  return useAtomValue(React.useMemo(() => makeLocalActionsAtomWithSelector(args ?? {}), [args]));
}

export function getTriples(args: UseTriplesArgs) {
  return store.get(makeLocalActionsAtomWithSelector(args));
}
