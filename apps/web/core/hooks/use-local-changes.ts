'use client';

import * as React from 'react';

import { reactiveRelations, reactiveValues } from '../sync/store';
import { Diff, type EntityDiff } from '../utils/diff';

/** Takes a point-in-time snapshot — diffs are computed on demand, not reactively. */
export const useLocalChanges = (spaceId?: string): readonly [EntityDiff[], boolean, () => void] => {
  const [diffs, setDiffs] = React.useState<EntityDiff[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const getLocalChanges = React.useCallback(() => {
    if (!spaceId) {
      setDiffs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // isLocal === true filters out hydrated server data (which has isLocal undefined)
    const localValues = reactiveValues
      .get()
      .filter(v => v.spaceId === spaceId && v.isLocal === true && !v.hasBeenPublished);
    const localRelations = reactiveRelations
      .get()
      .filter(r => r.spaceId === spaceId && r.isLocal === true && !r.hasBeenPublished);

    Diff.fromLocal(spaceId, localValues, localRelations).then(result => {
      setDiffs(result);
      setIsLoading(false);
    });
  }, [spaceId]);

  React.useEffect(() => {
    getLocalChanges();
  }, [getLocalChanges]);

  return [diffs, isLoading, getLocalChanges] as const;
};
