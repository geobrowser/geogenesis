'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAtom } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import { Effect } from 'effect';
import equal from 'fast-deep-equal';

import * as React from 'react';

import { getProperties, getProperty } from '../io/v2/queries';
import { OmitStrict } from '../types';
import { Properties } from '../utils/property';
// @TODO replace with Values.merge()
import { merge } from '../utils/value/values';
import { Entity, Property, Relation, Value } from '../v2.types';
import { EntityQuery, WhereCondition } from './experimental_query-layer';
import { E, mergeRelations } from './orm';
import { GeoStore, reactiveRelations, reactiveValues } from './store';
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

  const lastResultsRef = React.useRef<Entity[]>([]);
  const isFetchedRef = React.useRef(false);
  isFetchedRef.current = isFetched && enabled;

  const results = useSelector(
    reactive,
    () => {
      if (!enabled) {
        return [];
      }

      if (deferUntilFetched && !isFetchedRef.current) {
        return lastResultsRef.current;
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

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    if (isFetched) {
      lastResultsRef.current = results;
    }
  }, [enabled, isFetched, results]);

  return {
    entities: results,
    isLoading: !isFetched && enabled && isLoading,
  };
}

export function useQueryProperty({ id, spaceId, enabled = true }: QueryEntityOptions) {
  const cache = useQueryClient();
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

  // Prefer remote property data, then local store, then reconstructed
  const finalProperty = remoteProperty || property;

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
  const cache = useQueryClient();
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

      // Prefer remote property, but fall back to local
      if (remoteProp) {
        merged.push(remoteProp);
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
      if (mergeWith.length === 0) {
        return relations.filter(r =>
          selector ? selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false) : true
        );
      }

      return mergeRelations(relations, mergeWith).filter(r =>
        selector ? selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false) : true
      );
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
      .filter(r => (selector ? selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false) : true));
  }

  return mergeRelations(reactiveRelations.get(), mergeWith).filter(r =>
    selector ? selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false) : true
  );
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

      if (id) {
        return (
          searchableRelations.find(r => r.id === id && (includeDeleted ? true : Boolean(r.isDeleted) === false)) ?? null
        );
      }

      if (selector) {
        return (
          searchableRelations.find(r => selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false)) ?? null
        );
      }

      return null;
    },
    equal
  );

  return relation;
}

export function getRelation(options: UseRelationParams) {
  const { id, selector, includeDeleted = false, mergeWith = [] } = options;

  const relations =
    mergeWith.length === 0 ? reactiveRelations.get() : mergeRelations(reactiveRelations.get(), mergeWith);

  if (id) {
    return relations.find(r => r.id === id && (includeDeleted ? true : Boolean(r.isDeleted) === false)) ?? null;
  }

  if (selector) {
    return relations.find(r => selector(r) && (includeDeleted ? true : Boolean(r.isDeleted) === false)) ?? null;
  }

  return null;
}
