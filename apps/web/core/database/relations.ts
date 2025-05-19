'use client';

import equal from 'fast-deep-equal';
import { useAtomValue } from 'jotai';
import { atomFamily, selectAtom } from 'jotai/utils';

import * as React from 'react';

import { store } from '../state/jotai-store';
import { Relation } from '../types';
import { createRelationsAtom } from './atoms';

interface UseRelationsArgs {
  mergeWith?: Relation[];
  selector?: (t: Relation) => boolean;
  includeDeleted?: boolean;
}

const relationsAtomFamily = atomFamily(createRelationsAtom, equal);

const selectorAtomCache = new Map();

function getRelationsAtomWithSelector(args: UseRelationsArgs) {
  const { selector, includeDeleted = false, mergeWith = [] } = args;

  const mergeWithKey = JSON.stringify(mergeWith);
  const selectorKey = selector ? selector.toString() : 'null';
  const cacheKey = `${selectorKey}:${includeDeleted}:${mergeWithKey}`;

  if (selectorAtomCache.has(cacheKey)) {
    return selectorAtomCache.get(cacheKey);
  }

  const baseAtom = relationsAtomFamily(mergeWith);

  const newAtom = selectAtom(
    baseAtom,
    relations => {
      return relations.filter(r => (selector ? selector(r) : true) && (!includeDeleted ? !r.isDeleted : true));
    },
    equal
  );

  selectorAtomCache.set(cacheKey, newAtom);

  return newAtom;
}

export function useRelations(args: UseRelationsArgs): Relation[] {
  const stableArgs = React.useRef<UseRelationsArgs>({
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
    () => getRelationsAtomWithSelector(stableArgs),
    [stableArgs.selector, stableArgs.includeDeleted, JSON.stringify(stableArgs.mergeWith)]
  );

  return useAtomValue(atom) as Relation[];
}

export function getRelations(args: UseRelationsArgs): Relation[] {
  return store.get(getRelationsAtomWithSelector(args)) as Relation[];
}
