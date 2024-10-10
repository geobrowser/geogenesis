'use client';

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
  includeDeleted?: boolean;
}

const makeLocalActionsAtomWithSelector = ({ selector, includeDeleted = false, mergeWith = [] }: UseTriplesArgs) => {
  return atom(get => {
    const mergedTriples = Triples.merge(get(localOpsAtom), mergeWith);
    return mergedTriples.filter(t => {
      return (selector ? selector(t) : true) && (includeDeleted ? true : isNotDeletedSelector(t));
    });
  });
};

export function useTriples(args?: UseTriplesArgs) {
  return useAtomValue(React.useMemo(() => makeLocalActionsAtomWithSelector(args ?? {}), [args]));
}

export function getTriples(args: UseTriplesArgs) {
  return store.get(makeLocalActionsAtomWithSelector(args));
}
