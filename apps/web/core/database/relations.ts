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

const makeRelationsAtomFamily = atomFamily(createRelationsAtom, equal);

const makeLocalRelationsAtomWithSelector = ({ selector, includeDeleted = false, mergeWith = [] }: UseRelationsArgs) => {
  return selectAtom(
    makeRelationsAtomFamily(mergeWith),
    relations => {
      return relations.filter(r => (selector ? selector(r) : true) && (!includeDeleted ? !r.isDeleted : true));
    },
    equal
  );
};

export function useRelations(args: UseRelationsArgs) {
  const memoizedArgs = React.useMemo(() => args, [args]);
  const memoizedAtom = React.useMemo(() => makeLocalRelationsAtomWithSelector(memoizedArgs ?? {}), [memoizedArgs]);
  return useAtomValue(memoizedAtom);
}

export function getRelations(args: UseRelationsArgs) {
  return store.get(makeLocalRelationsAtomWithSelector(args));
}
