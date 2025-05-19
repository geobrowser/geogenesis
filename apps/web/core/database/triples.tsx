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

const atomCache = new Map();

function getLocalOpsAtomWithSelector(args: UseTriplesArgs) {
  const { selector, includeDeleted = false, mergeWith = [] } = args;

  const mergeWithKey = JSON.stringify(mergeWith);
  const selectorKey = selector ? selector.toString() : 'null';
  const cacheKey = `${selectorKey}:${includeDeleted}:${mergeWithKey}`;

  if (atomCache.has(cacheKey)) {
    return atomCache.get(cacheKey);
  }

  const newAtom = selectAtom(
    localOpsAtom,
    ops => {
      const mergedTriples = Triples.merge(ops, mergeWith);
      return mergedTriples.filter(t => {
        return (selector ? selector(t) : true) && (includeDeleted ? true : isNotDeletedSelector(t));
      });
    },
    equal
  );

  atomCache.set(cacheKey, newAtom);

  return newAtom;
}

export function useTriples(args?: UseTriplesArgs) {
  const stableArgs = React.useRef<UseTriplesArgs>({
    selector: args?.selector,
    includeDeleted: args?.includeDeleted ?? false,
    mergeWith: args?.mergeWith ?? [],
  }).current;

  React.useEffect(() => {
    stableArgs.selector = args?.selector;
    stableArgs.includeDeleted = args?.includeDeleted ?? false;
    stableArgs.mergeWith = args?.mergeWith ?? [];
  }, [args?.selector, args?.includeDeleted, args?.mergeWith ? JSON.stringify(args.mergeWith) : '[]']);

  const atom = React.useMemo(
    () => getLocalOpsAtomWithSelector(stableArgs),
    [stableArgs.selector, stableArgs.includeDeleted, JSON.stringify(stableArgs.mergeWith)]
  );

  return useAtomValue(atom) as ITriple[];
}

export function getTriples(args: UseTriplesArgs) {
  return store.get(getLocalOpsAtomWithSelector(args)) as ITriple[];
}
