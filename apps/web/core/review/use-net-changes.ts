'use client';

import { createAtom } from '@xstate/store';
import { useSelector } from '@xstate/store/react';

import equal from 'fast-deep-equal';

import { reactiveRelations, reactiveValues, syncedEntities, syncedEntitiesVersion } from '~/core/sync/store';
import type { Relation, Value } from '~/core/types';

import { getNetRelations, getNetValues } from './net-changes';

function isPending(change: Value | Relation) {
  return change.isLocal === true && change.hasBeenPublished === false;
}

// Track baselines as well as operations: empty hydration can change the net diff
// without writing an operation. Both review surfaces share this projection.
const netChanges = createAtom(
  () => {
    syncedEntitiesVersion.get();
    const values = getNetValues(reactiveValues.get().filter(isPending), syncedEntities);
    const relations = getNetRelations(reactiveRelations.get().filter(isPending), syncedEntities);
    const spaceIds = [
      ...new Set([...values.map(value => value.spaceId), ...relations.map(relation => relation.spaceId)]),
    ];
    return { values, relations, spaceIds };
  },
  { compare: equal }
);

export function useNetChanges() {
  return useSelector(netChanges, changes => changes);
}
