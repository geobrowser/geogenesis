'use client';

import { atom, useAtomValue } from 'jotai';

import * as React from 'react';

import { store } from '../state/jotai-store';
import { Relation } from '../types';
import { createRelationsAtom } from './atoms';

interface UseRelationsArgs {
  mergeWith?: Relation[];
  selector?: (t: Relation) => boolean;
  includeDeleted?: boolean;
}

const makeLocalActionsAtomWithSelector = ({ selector, includeDeleted = false, mergeWith = [] }: UseRelationsArgs) => {
  return atom(get => {
    return get(createRelationsAtom(mergeWith)).filter(r => {
      return (selector ? selector(r) : true) && (includeDeleted ? true : !r.isDeleted);
    });
  });
};

export function useRelations(args: UseRelationsArgs) {
  return useAtomValue(React.useMemo(() => makeLocalActionsAtomWithSelector(args), [args]));
}

export function getRelations(args: UseRelationsArgs) {
  return store.get(makeLocalActionsAtomWithSelector(args));
}
