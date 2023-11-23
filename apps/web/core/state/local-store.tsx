'use client';

import * as React from 'react';

import { Entity } from '~/core/utils/entity';
import { Triple } from '~/core/utils/triple';

import { useActionsStore } from '../hooks/use-actions-store';

export function useLocalStore() {
  const { allActions } = useActionsStore();

  const triples = React.useMemo(() => {
    const triples = Triple.fromActions(allActions, []);
    return Triple.withLocalNames(allActions, triples);
  }, [allActions]);

  const entities = React.useMemo(() => {
    return Entity.entitiesFromTriples(triples);
  }, [triples]);

  return {
    triples,
    entities,
  };
}
