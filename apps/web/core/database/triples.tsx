'use client';

import equal from 'fast-deep-equal';
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
      // console.log({ mergedTriples, ops, mergeWith });
      return mergedTriples.filter(t => {
        return (selector ? selector(t) : true) && (includeDeleted ? true : isNotDeletedSelector(t));
      });
    },
    equal
  );
}

export function useTriples(args?: UseTriplesArgs) {
  const memoizedArgs = React.useMemo(() => args, [args]);
  const memoizedAtom = React.useMemo(() => makeLocalOpsAtomWithSelector(memoizedArgs ?? {}), [memoizedArgs]);
  // console.log({ args, memoizedAtom, memoizedArgs, useAtomValue: useAtomValue(memoizedAtom) });
  // // debugger; //cia esme
  return useAtomValue(memoizedAtom);
}

export function getTriples(args: UseTriplesArgs) {
  return store.get(makeLocalOpsAtomWithSelector(args));
}
