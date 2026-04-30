'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAtom } from '@xstate/store';
import { useSelector } from '@xstate/store/react';

import * as React from 'react';

import { Effect } from 'effect';
import equal from 'fast-deep-equal';

import { getProperties, getProperty } from '../io/queries';
import { OmitStrict } from '../types';
import { Entity, Property, Relation, Value } from '../types';
import { Properties } from '../utils/property';
// @TODO replace with Values.merge()
import { merge } from '../utils/value/values';
import { EntityQuery, WhereCondition } from './experimental_query-layer';
import { E, mergeRelations } from './orm';
import { GeoStore, reactiveRelations, reactiveValues, resolveRelationNames, stableStringify } from './store';
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

// Signal that fires when the store changes. Derived from both atoms so
// useSelector subscribers re-evaluate when either values or relations update.
// Selectors don't read this value — they call store.getEntity() directly.
// compare: () => false ensures the atom always notifies subscribers when
// dependencies change, even though the returned value is constant.
const reactive = createAtom(
  () => {
    reactiveValues.get();
    reactiveRelations.get();
    return 0;
  },
  { compare: () => false }
);

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
      const { merged, remote } = await E.syncOne({ id, store, cache });

      if (merged) {
        stream.emit({
          type: GeoEventStream.ENTITIES_SYNCED,
          entities: [merged],
          remoteEntities: remote ? [remote] : [],
        });
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
  /**
   * Cursor-based pagination. Pass the `endCursor` from the previous page's
   * result to fetch the next page; omit (or pass undefined) to start at the
   * beginning.
   */
  after?: string;
  /**
   * Bounded forward offset relative to `after`. Used by the hybrid jump-to-page
   * pager: the data block UI keeps a small set of cursor anchors and uses
   * `offset` to bridge to a target page from the closest anchor (capped to
   * keep the offset out of the SQL slow zone).
   */
  offset?: number;
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
  after,
  offset,
  enabled = true,
  placeholderData = undefined,
  deferUntilFetched = false,
  sort,
}: QueryEntitiesOptions & {
  sort?: { propertyId: string; direction: 'asc' | 'desc'; dataType?: string };
}) {
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
  const {
    isFetched,
    isLoading,
    isPlaceholderData,
    data,
  } = useQuery({
    enabled,
    placeholderData,
    queryKey: [...GeoStore.queryKeys(where, first, after, offset), sort ?? null],
    queryFn: async () => {
      const { merged, remote, endCursor, hasNextPage } = await E.syncMany({
        store,
        cache,
        where,
        first,
        after,
        offset,
        sort,
      });
      stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: merged, remoteEntities: remote });
      return { ids: merged.map(e => e.id), endCursor, hasNextPage };
    },
  });

  // Prefetch the next page once the current one resolves so a click on
  // "Next" hits a warm React Query cache. Keyed by the same shape the actual
  // fetch uses (after = current endCursor, offset = 0), so the subsequent
  // useQuery call inside the data block will deduplicate against this entry.
  // Skip while showing placeholder data — the endCursor is from the prior
  // page in that window and would seed the wrong anchor.
  const prefetchEndCursor = !isPlaceholderData && data?.hasNextPage ? data.endCursor : null;
  // Stringify ref-unstable inputs (callers like useCollection rebuild `where`
  // inline each render) so the effect only re-runs when the semantic key
  // changes, not on every render.
  const prefetchKeyTail = React.useMemo(
    () => stableStringify({ where, first, sort: sort ?? null }),
    [where, first, sort]
  );
  React.useEffect(() => {
    if (!enabled) return;
    if (!prefetchEndCursor) return;
    const nextAfter = prefetchEndCursor;
    cache.prefetchQuery({
      queryKey: [...GeoStore.queryKeys(where, first, nextAfter, 0), sort ?? null],
      queryFn: async () => {
        const result = await E.syncMany({ store, cache, where, first, after: nextAfter, offset: 0, sort });
        stream.emit({
          type: GeoEventStream.ENTITIES_SYNCED,
          entities: result.merged,
          remoteEntities: result.remote,
        });
        return { ids: result.merged.map(e => e.id), endCursor: result.endCursor, hasNextPage: result.hasNextPage };
      },
    });
  }, [enabled, prefetchEndCursor, prefetchKeyTail, cache, store, stream]);

  const results = useSelector(
    reactive,
    () => {
      if (!enabled) {
        return [];
      }

      if (deferUntilFetched && !isFetched) {
        return [];
      }

      // Mirror the server-side empty-name exclusion (added by
      // convertWhereConditionToEntityFilter) at the local layer. Local-only
      // entities — e.g. a freshly-created collection item that hasn't been
      // named yet, or a synced entity whose name was just deleted locally —
      // would otherwise leak into the rendered page because EntityQuery
      // doesn't know about that clause.
      const hasVisibleName = (e: Entity): boolean => e.name != null && e.name !== '';

      // For id.in queries (COLLECTION sources), the where condition is fully
      // bounded by a known id list, so the local store is authoritative for
      // membership. Read directly from EntityQuery so newly-created entities
      // appear immediately — without this, keepPreviousData would keep the
      // selector pinned to the previous id list until the new network fetch
      // resolves, hiding just-created items in the UI.
      if (where?.id?.in && !sort) {
        return new EntityQuery(store.getEntities())
          .where(where)
          .limit(first)
          .sortBy({ field: 'updatedAt', direction: 'desc' })
          .execute()
          .filter(hasVisibleName);
      }

      // Cursor/offset paginated queries: materialize the page from the
      // server-returned ids so the active window matches the fetched data.
      // Reading each entity through the store still picks up local edits.
      // Falls back to a local EntityQuery only before the first fetch lands.
      if (data?.ids) {
        return data.ids
          .map(id => store.getEntity(id))
          .filter((e): e is Entity => e != null && hasVisibleName(e));
      }

      const query = new EntityQuery(store.getEntities())
        .where(where)
        .limit(first)
        .sortBy({ field: 'updatedAt', direction: 'desc' });

      return query.execute().filter(hasVisibleName);
    },
    equal
  );

  return {
    entities: results,
    isLoading: !isFetched && enabled && isLoading,
    isFetched: isFetched && enabled,
    /**
     * True while React Query is serving the previous page's data because
     * `placeholderData: keepPreviousData` is in effect and the current key
     * hasn't resolved yet. Consumers driving cursor history off `endCursor`
     * must skip recording while this is true — the cursor in `data` is from
     * the prior page.
     */
    isPlaceholderData,
    endCursor: data?.endCursor ?? null,
    hasNextPage: data?.hasNextPage ?? false,
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

    return { ...remoteProperty, ...property, name: property.name || remoteProperty.name };
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
    placeholderData: keepPreviousData,
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
        const localRelationEntityTypes = localProp?.relationEntityTypes;
        const overrides: Partial<Property> = {};
        if (localRelationValueTypes && localRelationValueTypes.length > 0) {
          overrides.relationValueTypes = localRelationValueTypes;
        }
        if (localRelationEntityTypes && localRelationEntityTypes.length > 0) {
          overrides.relationEntityTypes = localRelationEntityTypes;
        }
        if (Object.keys(overrides).length > 0) {
          merged.push({ ...remoteProp, ...overrides });
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
  after?: string;
  offset?: number;
  where: WhereCondition;
}

export function useQueryEntitiesAsync() {
  const cache = useQueryClient();
  const { store } = useSyncEngine();

  return ({ where, first = 9, after, offset }: FindManyParameters) =>
    E.findMany({ store, cache, where, first, after, offset });
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
    reactive,
    () => {
      const relations = reactiveRelations.get();
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
    reactive,
    () => {
      const relations = reactiveRelations.get();
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
