import { atom, useAtomValue } from 'jotai';

import * as React from 'react';

import { Relation } from '../io/dto/entities';
import { createRelationsAtom } from '../state/actions-store/create-relations-for-entity-atom';
import { store } from '../state/jotai-store';

interface UseRelationsArgs {
  mergeWith?: Relation[];
  selector?: (t: Relation) => boolean;
}

const makeLocalActionsAtomWithSelector = ({ selector, mergeWith = [] }: UseRelationsArgs) => {
  return atom(get => {
    return get(createRelationsAtom(mergeWith)).filter(r => {
      return selector ? selector(r) : true;
    });
  });
};

export function useRelations(args: UseRelationsArgs) {
  return useAtomValue(React.useMemo(() => makeLocalActionsAtomWithSelector(args), [args]));
}

export function getRelations(args: UseRelationsArgs) {
  return store.get(makeLocalActionsAtomWithSelector(args));
}
