'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAtom } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import { Effect } from 'effect';
import equal from 'fast-deep-equal';

import * as React from 'react';

import { getProperties, getProperty } from '../io/queries';
import { OmitStrict } from '../types';
import { Property, Relation, Value } from '../types';
import { Properties } from '../utils/property';
// @TODO replace with Values.merge()
import { merge } from '../utils/value/values';
import { EntityQuery, WhereCondition } from './experimental_query-layer';
import { E, mergeRelations } from './orm';
import { GeoStore, reactiveRelations, reactiveValues, resolveRelationNames } from './store';
import { GeoEventStream } from './stream';
import { useSyncEngine } from './use-sync-engine';

type QueryEntityOptions = {
  id?: string;
  spaceId?: string;
  /**
   * By default we query the local store for the entity without
   * querying the remote server. This assumes that the entity
   * has already been hydrated elsewhere in the app, so there's
   * no need to do it again.
   *
   * There may be cases where the entity hasn't been pre-hydrated,
   * so we can pass a flag to ensure it's hydrated as part of the
   * hook instantiation.
   */
  shouldHydrate?: boolean;
  /**
   * @TODO how do we merge enabled and shouldHydrate?
   */
  enabled?: boolean;
};

const reactive = createAtom(() => ({
  values: reactiveValues.get(),
  relations: reactiveRelations.get(),
}));

/**
 * Triggers sync for a specific entity. This is useful when we want to
 * hydrate the sync store ahead of time from within React.
 *
 * If you want to hydrate the sync store outside of react, use the store's
 * "hydrate" method instead.
 *
 * ```ts
 * store.hydrate({ id, spaceId });
 * ```
 */
export function useHydrateEntity({ id, enabled = true }: OmitStrict<QueryEntityOptions, 'shouldHydrate' | 'spaceId'>) {
  const cache = useQueryClient();
  const { store, stream } = useSyncEngine();

  const { isFetched } = useQuery({
    enabled: Boolean(id) && enabled,
    queryKey: GeoStore.queryKey(id),
    queryFn: async () => {
      // If the entity is in the store then it's already been synced and we can
      // skip this work
      if (!id) {
        return null;
      }

      /**
       * We explicitly don't query by space id here and let the sync
       * engine handle filtering it as the hook receives events
       */
      const merged = await E.findOne({ id, store, cache });

      if (merged) {
        stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: [merged] });
        return merged;
      }

      return null;
    },
  });

  return { isFetched };
}

/**
 * @TODO: We're basically inventing @tanstack/db. Right now it's
 * not stable (as of July 2025). Once it's stable we should just
 * migrate to @tanstack/db and use that instead.
 */
export function useQueryEntity({ id, spaceId, enabled = true }: QueryEntityOptions) {
  const { store } = useSyncEngine();
  const { isFetched } = useHydrateEntity({ id, enabled });

  const entity = useSelector(
    reactive,
    () => {
      if (!id || !enabled) {
        return null;
      }

      return store.getEntity(id, { spaceId }) ?? null;
    },
    equal
  );

  return {
    entity,
    isLoading: !isFetched && Boolean(id) && enabled,
  };
}

export function useQueryRelation({ id, spaceId, enabled = true }: QueryEntityOptions) {
  const cache = useQueryClient();
  // const { store, stream } = useSyncEngine();

  const { isFetched, data: entity } = useQuery({
    enabled: Boolean(id) && enabled,
    queryKey: GeoStore.queryKey(id),
    queryFn: async () => {
      // If the entity is in the store then it's already been synced and we can
      // skip this work
      if (!id) {
        return null;
      }

      /**
       * We explicitly don't query by space id here and let the sync
       * engine handle filtering it as the hook receives events
       */
      const merged = await E.findOneRelation({ id, spaceId, cache });

      return merged;
    },
  });

  return {
    entity,
    isLoading: !isFetched && Boolean(id) && enabled,
  };
}

type QueryEntitiesOptions = {
  where: WhereCondition;
  first?: number;
  skip?: number;
  placeholderData?: typeof keepPreviousData;
  /**
   * When true, returns an empty array until the initial fetch completes.
   * This prevents the selector from returning partial/stale results from
   * the reactive store while the remote query is still in flight.
   */
  deferUntilFetched?: boolean;

  /**
   * By default we query the local store for the entity without
   * querying the remote server. This assumes that the entity
   * has already been hydrated elsewhere in the app, so there's
   * no need to do it again.
   *
   * There may be cases where the entity hasn't been pre-hydrated,
   * so we can pass a flag to ensure it's hydrated as part of the
   * hook instantiation.
   */
  shouldHydrate?: boolean;
  /**
   * @TODO how do we merge enabled and shouldHydrate?
   */
  enabled?: boolean;
};

export function useQueryEntities({
  where,
  first = 9,
  skip = 0,
  enabled = true,
  placeholderData = undefined,
  deferUntilFetched = false,
}: QueryEntitiesOptions) {
  const cache = useQueryClient();
  const { store, stream } = useSyncEngine();

  /**
   * This query runs behind the scenes to sync any remote entities that match
   * the filter condition and merge into the local store. It only runs once,
   * or if the filter changes.
   *
   * In the future we can decide that we want to sync more often, so we can
   * use RQ's refetch function or add a polling/refetch interval.
   *
   * The placeholderData parameter allows controlling what happens during a refetch:
   * - When set to keepPreviousData: previous data will be shown while new data is being
   *   fetched, preventing flickering and UI jumps
   * - When set to undefined (default): standard loading behavior applies
   *
   * To prevent flicker when adding new items to collections, callers should explicitly
   * pass keepPreviousData when they want to maintain the previous data during refetches.
   */
  const { isFetched, isLoading } = useQuery({
    enabled,
    placeholderData,
    queryKey: GeoStore.queryKeys(where, first, skip),
    queryFn: async () => {
      const entities = await E.findMany({ store, cache, where, first, skip });
      stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities });
      return entities;
    },
  });

  const results = useSelector(
    reactive,
    () => {
      if (!enabled) {
        return [];
      }

      if (deferUntilFetched && !isFetched) {
        return [];
      }

      const result = new EntityQuery(store.getEntities())
        .where(where)
        .limit(first)
        .offset(skip)
        .sortBy({ field: 'updatedAt', direction: 'desc' })
        .execute();

      return result;
    },
    equal
  );

  return {
    entities: results,
    isLoading: !isFetched && enabled && isLoading,
  };
}

export function useQueryProperty({ id, spaceId, enabled = true }: QueryEntityOptions) {
  const { store } = useSyncEngine();

  const { data: remoteProperty, isFetched } = useQuery({
    enabled: enabled && Boolean(id),
    queryKey: ['store', 'property', JSON.stringify({ id, spaceId, enabled })],
    queryFn: async (): Promise<Property | null> => {
      if (!id) {
        return null;
      }

      return await Effect.runPromise(getProperty(id));
    },
  });

  // Hydrate the property entity so the store has its relations.
  // The property API doesn't return relationValueTypes.
  useHydrateEntity({ id, enabled: enabled && Boolean(id) });

  // Try store.getProperty first (for local properties with dataType registered)
  // Fall back to manual reconstruction (for existing properties added to entities)
  const property = useSelector(
    reactive,
    () => {
      if (!id || !enabled) {
        return null;
      }

      // First try the store's getProperty method (works for registered local properties)
      const storeProperty = store.getProperty(id);
      if (storeProperty) {
        return storeProperty;
      }

      // Fall back to manual reconstruction for existing properties
      return Properties.reconstructFromStore(id, getValues, getRelations);
    },
    equal
  );

  // Local property data takes precedence over remote
  const finalProperty = React.useMemo(() => {
    if (!remoteProperty) return property;
    if (!property) return remoteProperty;

    return { ...remoteProperty, ...property };
  }, [remoteProperty, property]);

  return {
    property: finalProperty,
    isLoading: !isFetched && Boolean(id) && enabled,
  };
}

type QueryPropertiesOptions = {
  ids: string[];
  enabled?: boolean;
};

export function useQueryProperties({ ids, enabled = true }: QueryPropertiesOptions) {
  const { store } = useSyncEngine();

  const { data: remoteProperties, isFetched } = useQuery({
    enabled: enabled,
    queryKey: ['store', 'properties', JSON.stringify({ ids, enabled })],
    queryFn: async (): Promise<Property[]> => {
      return await Effect.runPromise(getProperties(ids));
    },
  });

  // Try store.getProperty first, fall back to manual reconstruction
  const localProperties = useSelector(
    reactive,
    () => {
      if (!enabled || !ids.length) {
        return [];
      }

      const props: Property[] = [];

      for (const id of ids) {
        // First try the store's getProperty method
        const storeProperty = store.getProperty(id);
        if (storeProperty) {
          props.push(storeProperty);
          continue;
        }

        // Fall back to manual reconstruction for existing properties
        const reconstructedProperty = Properties.reconstructFromStore(id, getValues, getRelations);
        if (reconstructedProperty) {
          props.push(reconstructedProperty);
        }
      }

      return props;
    },
    equal
  );

  // Merge remote and local properties, preferring remote when both exist
  const allProperties = React.useMemo(() => {
    const remotePropsMap = new Map((remoteProperties || []).map(p => [p.id, p]));
    const localPropsMap = new Map(localProperties.map(p => [p.id, p]));

    const merged: Property[] = [];

    for (const id of ids) {
      const remoteProp = remotePropsMap.get(id);
      const localProp = localPropsMap.get(id);

      if (remoteProp) {
        const localRelationValueTypes = localProp?.relationValueTypes;
        if (localRelationValueTypes && localRelationValueTypes.length > 0) {
          merged.push({ ...remoteProp, relationValueTypes: localRelationValueTypes });
        } else {
          merged.push(remoteProp);
        }
      } else if (localProp) {
        merged.push(localProp);
      }
    }

    return merged;
  }, [remoteProperties, localProperties, ids]);

  return {
    properties: allProperties,
    isLoading: !isFetched && enabled,
  };
}

interface FindManyParameters {
  first?: number;
  skip?: number;
  where: WhereCondition;
}

export function useQueryEntitiesAsync() {
  const cache = useQueryClient();
  const { store } = useSyncEngine();

  return ({ where, first = 9, skip = 0 }: FindManyParameters) => E.findMany({ store, cache, where, first, skip });
}

export function useQueryEntityAsync() {
  const cache = useQueryClient();
  const { store } = useSyncEngine();

  return (id: string) => E.findOne({ store, cache, id });
}

type UseValuesParams = {
  selector?: (v: Value) => boolean;
  includeDeleted?: boolean;
};

export function useValues(options: UseValuesParams & { mergeWith?: Value[] } = {}) {
  const { selector, includeDeleted = false } = options;

  const values = useSelector(
    reactiveValues,
    state => {
      return selector
        ? state.filter(v => selector(v) && (includeDeleted ? true : Boolean(v.isDeleted) === false))
        : state;
    },
    equal
  );

  return values;
}

export function getValues(options: UseValuesParams & { mergeWith?: Value[] } = {}) {
  const { selector, includeDeleted = false, mergeWith = [] } = options;

  if (mergeWith.length === 0) {
    return reactiveValues
      .get()
      .filter(v => (selector ? selector(v) && (includeDeleted ? true : Boolean(v.isDeleted) === false) : true));
  }

  return merge(reactiveValues.get(), mergeWith).filter(v =>
    selector ? selector(v) && (includeDeleted ? true : Boolean(v.isDeleted) === false) : true
  );
}

type UseValueParams = {
  id?: string;
  selector?: (v: Value) => boolean;
  includeDeleted?: boolean;
};

export function useValue(options: UseValueParams) {
  const { id, selector, includeDeleted = false } = options;

  const value = useSelector(
    reactiveValues,
    state => {
      if (id) {
        return state.find(v => v.id === id && (includeDeleted ? true : Boolean(v.isDeleted) === false)) ?? null;
      }

      if (selector) {
        return state.find(v => selector(v) && (includeDeleted ? true : Boolean(v.isDeleted) === false)) ?? null;
      }

      return null;
    },
    equal
  );

  return value;
}

/**
 * Space-aware value lookup for data block cells. Returns a single Value
 * preferring the current space, falling back to any space.
 *
 * Use this instead of useValue when rendering data that may originate from
 * a different space than the one being edited. Entity pages should use
 * useValue with a strict spaceId filter instead — they want null when
 * the value doesn't exist in the current space.
 */
export function useSpaceAwareValue(options: { entityId: string; propertyId: string; spaceId: string }) {
  const { entityId, propertyId, spaceId } = options;

  const value = useSelector(
    reactiveValues,
    state => {
      let fallback: Value | null = null;

      for (const v of state) {
        if (v.entity.id !== entityId || v.property.id !== propertyId || v.isDeleted) continue;
        if (v.spaceId === spaceId) return v;
        fallback ??= v;
      }

      return fallback;
    },
    equal
  );

  return value;
}

export function getValue(options: UseValueParams & { mergeWith?: Value[] }) {
  const { id, selector, includeDeleted = false, mergeWith = [] } = options;

  const values = mergeWith.length === 0 ? reactiveValues.get() : merge(reactiveValues.get(), mergeWith);

  if (id) {
    return values.find(v => v.id === id && (includeDeleted ? true : Boolean(v.isDeleted) === false)) ?? null;
  }

  if (selector) {
    return values.find(v => selector(v) && (includeDeleted ? true : Boolean(v.isDeleted) === false)) ?? null;
  }

  return null;
}

type UseRelationsParams = {
  selector?: (r: Relation) => boolean;
  includeDeleted?: boolean;
  mergeWith?: Relation[];
};

export function useRelations(options: UseRelationsParams = {}) {
  const { selector, includeDeleted = false, mergeWith = [] } = options;

  const values = useSelector(
    reactiveRelations,
    relations => {
      const filtered =
        mergeWith.length === 0
          ? relations.filter(r =>
              selector ? selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false) : true
            )
          : mergeRelations(relations, mergeWith).filter(r =>
              selector ? selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false) : true
            );

      return filtered.map(resolveRelationNames);
    },
    equal
  );

  return values;
}

export function getRelations(options: UseRelationsParams = {}) {
  const { selector, includeDeleted = false, mergeWith = [] } = options;

  if (mergeWith.length === 0) {
    return reactiveRelations
      .get()
      .filter(r => (selector ? selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false) : true))
      .map(resolveRelationNames);
  }

  return mergeRelations(reactiveRelations.get(), mergeWith)
    .filter(r => (selector ? selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false) : true))
    .map(resolveRelationNames);
}

type UseRelationParams = {
  id?: string;
  selector?: (r: Relation) => boolean;
  includeDeleted?: boolean;
  mergeWith?: Relation[];
};

export function useRelation(options: UseRelationParams) {
  const { id, selector, includeDeleted = false, mergeWith = [] } = options;

  const relation = useSelector(
    reactiveRelations,
    relations => {
      const searchableRelations = mergeWith.length === 0 ? relations : mergeRelations(relations, mergeWith);

      let found: Relation | null = null;

      if (id) {
        found =
          searchableRelations.find(r => r.id === id && (includeDeleted ? true : Boolean(r.isDeleted) === false)) ??
          null;
      } else if (selector) {
        found =
          searchableRelations.find(r => selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false)) ??
          null;
      }

      return found ? resolveRelationNames(found) : null;
    },
    equal
  );

  return relation;
}

export function getRelation(options: UseRelationParams) {
  const { id, selector, includeDeleted = false, mergeWith = [] } = options;

  const relations =
    mergeWith.length === 0 ? reactiveRelations.get() : mergeRelations(reactiveRelations.get(), mergeWith);

  let found: Relation | null = null;

  if (id) {
    found = relations.find(r => r.id === id && (includeDeleted ? true : Boolean(r.isDeleted) === false)) ?? null;
  } else if (selector) {
    found = relations.find(r => selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false)) ?? null;
  }

  return found ? resolveRelationNames(found) : null;
}
