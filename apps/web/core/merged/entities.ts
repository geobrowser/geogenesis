import { atom, useAtomValue } from 'jotai';

import * as React from 'react';

import { createRelationsAtom } from '../database/atoms';
import { Entity } from '../io/dto/entities';
import { store } from '../state/jotai-store';

interface UseEntitiesArgs {
  mergeWith?: Entity[];
  selector?: (t: Entity) => boolean;
}

const makeLocalActionsAtomWithSelector = ({ selector, mergeWith = [] }: UseEntitiesArgs) => {
  return atom(get => {
    return get(createRelationsAtom(mergeWith)).filter(r => {
      return selector ? selector(r) : true;
    });
  });
};

export function useEntities(args: UseEntitiesArgs) {
  return useAtomValue(React.useMemo(() => makeLocalActionsAtomWithSelector(args), [args]));
}

export function getEntities(args: UseEntitiesArgs) {
  return store.get(makeLocalActionsAtomWithSelector(args));
}
