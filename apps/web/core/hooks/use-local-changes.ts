'use client';

import * as React from 'react';

import { reactiveRelations, reactiveValues } from '../sync/store';
import type { Relation, Value } from '../types';
import { Diff, type EntityDiff } from '../utils/diff';

type UseLocalChangesOptions = {
  mergeWithValues?: Value[];
  mergeWithRelations?: Relation[];
};

const EMPTY_VALUES: Value[] = [];
const EMPTY_RELATIONS: Relation[] = [];

export const useLocalChanges = (
  spaceId?: string,
  version = 0,
  options: UseLocalChangesOptions = {}
): readonly [EntityDiff[], boolean] => {
  const mergeWithValues = options.mergeWithValues ?? EMPTY_VALUES;
  const mergeWithRelations = options.mergeWithRelations ?? EMPTY_RELATIONS;
  const [diffs, setDiffs] = React.useState<EntityDiff[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!spaceId) {
      setDiffs([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const storeValues = reactiveValues
      .get()
      .filter(v => v.spaceId === spaceId && v.isLocal === true && !v.hasBeenPublished);
    const storeRelations = reactiveRelations
      .get()
      .filter(r => r.spaceId === spaceId && r.isLocal === true && !r.hasBeenPublished);

    const mergeValuesForSpace = mergeWithValues.filter(
      v =>
        v.spaceId === spaceId &&
        v.isLocal === true &&
        (v.hasBeenPublished === false || v.hasBeenPublished === undefined)
    );
    const mergeRelationsForSpace = mergeWithRelations.filter(
      r =>
        r.spaceId === spaceId &&
        r.isLocal === true &&
        (r.hasBeenPublished === false || r.hasBeenPublished === undefined)
    );

    const storeIds = new Set([...storeValues.map(v => v.id), ...storeRelations.map(r => r.id)]);
    const localValues = [...storeValues, ...mergeValuesForSpace.filter(v => !storeIds.has(v.id))];
    const localRelations = [...storeRelations, ...mergeRelationsForSpace.filter(r => !storeIds.has(r.id))];

    const allRelationsForSpace = reactiveRelations.get().filter(r => r.spaceId === spaceId && !r.isDeleted);

    Diff.fromLocal(spaceId, localValues, localRelations, allRelationsForSpace).then(result => {
      if (!cancelled) {
        setDiffs(result);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [spaceId, version, mergeWithValues, mergeWithRelations]);

  return [diffs, isLoading] as const;
};
