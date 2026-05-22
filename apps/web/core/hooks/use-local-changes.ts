'use client';

import * as React from 'react';

import { createAtom } from '@xstate/store';
import { useSelector } from '@xstate/store/react';

import { reactiveRelations, reactiveValues } from '../sync/store';
import type { Relation, Value } from '../types';
import { Diff, type EntityDiff } from '../utils/diff';

type UseLocalChangesOptions = {
  mergeWithValues?: Value[];
  mergeWithRelations?: Relation[];
};

const EMPTY_VALUES: Value[] = [];
const EMPTY_RELATIONS: Relation[] = [];

const localChangesStoreTick = createAtom(
  () => {
    reactiveValues.get();
    reactiveRelations.get();
    return 0;
  },
  { compare: () => false }
);

export function getLocalUnpublishedChangesFingerprint(): string {
  const valueIds = reactiveValues
    .get()
    .filter(v => v.isLocal === true && v.hasBeenPublished === false)
    .map(v => v.id)
    .sort();
  const relationIds = reactiveRelations
    .get()
    .filter(r => r.isLocal === true && r.hasBeenPublished === false)
    .map(r => r.id)
    .sort();
  return `${valueIds.join(',')}|${relationIds.join(',')}`;
}

export const useLocalChanges = (
  spaceId?: string,
  version = 0,
  options: UseLocalChangesOptions = {}
): readonly [EntityDiff[], boolean] => {
  const mergeWithValues = options.mergeWithValues ?? EMPTY_VALUES;
  const mergeWithRelations = options.mergeWithRelations ?? EMPTY_RELATIONS;
  const [diffs, setDiffs] = React.useState<EntityDiff[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const storeTick = useSelector(localChangesStoreTick, s => s);
  const lastLoadingKeyRef = React.useRef<string>('');

  React.useEffect(() => {
    if (!spaceId) {
      setDiffs([]);
      setIsLoading(false);
      lastLoadingKeyRef.current = '';
      return;
    }

    const loadingKey = `${spaceId}:${version}`;
    const shouldShowLoading = lastLoadingKeyRef.current !== loadingKey;
    if (shouldShowLoading) {
      lastLoadingKeyRef.current = loadingKey;
      setIsLoading(true);
    }

    let cancelled = false;

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
  }, [spaceId, version, storeTick, mergeWithValues, mergeWithRelations]);

  return [diffs, isLoading] as const;
};
