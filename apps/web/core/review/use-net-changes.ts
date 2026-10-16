'use client';

import { createAtom } from '@xstate/store';
import { useSelector } from '@xstate/store/react';

import equal from 'fast-deep-equal';

import { reactiveRelations, reactiveValues, syncedEntities } from '~/core/sync/store';
import type { Relation, Value } from '~/core/types';

import { getNetRelations, getNetValues } from './net-changes';

function isPending(change: Value | Relation) {
  return change.isLocal === true && change.hasBeenPublished === false;
}

// Sync writes the remote baseline before updating these atoms. Filter inside the
// subscription so a changed baseline is observed even if pending ops stay identical.
// Both review surfaces share this projection and its equality check.
const netChanges = createAtom(
  () => {
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
