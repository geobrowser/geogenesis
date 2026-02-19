'use client';

import * as React from 'react';

import { reactiveRelations, reactiveValues } from '../sync/store';
import { Diff, type EntityDiff } from '../utils/diff';

/** Computes local diffs for a space. Bump `version` to force a re-compute. */
export const useLocalChanges = (spaceId?: string, version = 0): readonly [EntityDiff[], boolean] => {
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

    // isLocal === true filters out hydrated server data (which has isLocal undefined)
    const localValues = reactiveValues
      .get()
      .filter(v => v.spaceId === spaceId && v.isLocal === true && !v.hasBeenPublished);
    const localRelations = reactiveRelations
      .get()
      .filter(r => r.spaceId === spaceId && r.isLocal === true && !r.hasBeenPublished);

    // Include all store relations (local + server-hydrated) so fromLocal()
    // can use BLOCKS relations to resolve config entity parents.
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
  }, [spaceId, version]);

  return [diffs, isLoading] as const;
};
