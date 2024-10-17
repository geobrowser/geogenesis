'use client';

import { Hash } from 'effect';
import { useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';

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

function makeLocalOpsAtomWithSelector({ selector, includeDeleted = false, mergeWith = [] }: UseTriplesArgs) {
  return selectAtom(
    localOpsAtom,
    ops => {
      const mergedTriples = Triples.merge(ops, mergeWith);
      return mergedTriples.filter(t => {
        return (selector ? selector(t) : true) && (includeDeleted ? true : isNotDeletedSelector(t));
      });
    },
    (a, b) => Hash.array(a) === Hash.array(b)
  );
}

export function useTriples(args?: UseTriplesArgs) {
  const memoizedArgs = React.useMemo(() => args, [args]);
  const memoizedAtom = React.useMemo(() => makeLocalOpsAtomWithSelector(memoizedArgs ?? {}), [memoizedArgs]);
  return useAtomValue(memoizedAtom);
}

export function getTriples(args: UseTriplesArgs) {
  return store.get(makeLocalOpsAtomWithSelector(args));
}
