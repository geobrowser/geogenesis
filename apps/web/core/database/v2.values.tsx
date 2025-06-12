'use client';

import equal from 'fast-deep-equal';
import { useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';

import * as React from 'react';

import { store } from '../state/jotai-store';
import { Values } from '../utils/value';
import { Value } from '../v2.types';
import { isNotDeletedSelector } from './selectors';
import { localValuesAtom } from './write';

interface UseValuesArgs {
  mergeWith?: Value[];
  selector?: (t: Value) => boolean;
  includeDeleted?: boolean;
}

function makeLocalOpsAtomWithSelector({ selector, includeDeleted = false, mergeWith = [] }: UseValuesArgs) {
  return selectAtom(
    localValuesAtom,
    ops => {
      const mergedValues = Values.merge(ops, mergeWith);
      return mergedValues.filter(t => {
        return (selector ? selector(t) : true) && (includeDeleted ? true : isNotDeletedSelector(t));
      });
    },
    equal
  );
}

export function useValues(args?: UseValuesArgs) {
  const memoizedArgs = React.useMemo(() => args, [args]);
  const memoizedAtom = React.useMemo(() => makeLocalOpsAtomWithSelector(memoizedArgs ?? {}), [memoizedArgs]);
  return useAtomValue(memoizedAtom);
}

export function getValues(args: UseValuesArgs) {
  return store.get(makeLocalOpsAtomWithSelector(args));
}
