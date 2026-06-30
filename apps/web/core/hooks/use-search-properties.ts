'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Duration, Effect } from 'effect';

import { DATA_TYPE_ENTITY_IDS, DATA_TYPE_PROPERTY, RENDERABLE_TYPE_PROPERTY } from '~/core/constants';
import { type EntityFilter } from '~/core/gql/graphql';
import { searchPropertiesPage } from '~/core/io/queries';
import type { DataType } from '~/core/types';

import { useDebouncedValue } from './use-debounced-value';

interface UseSearchPropertiesOptions {
  /** Filter results to properties whose base dataType equals this. */
  dataType?: DataType;
  /**
   * Filter results to properties whose renderable type ID matches.
   * Pass `null` to require renderableType to be absent (no relation).
   * Omit to skip this filter.
   */
  renderableTypeId?: string | null;
  /**
   * Require that the property has a `relationValueTypes` relation pointing at
   * every ID in this list. Only meaningful for RELATION properties.
   */
  requiredRelationValueTypeIds?: string[];
  /**
   * When true, run the search even with an empty query so the popover opens
   * pre-populated.
   */
  enabled?: boolean;
}

const PAGE_SIZE = 25;

const PROPERTY_TYPE_ID = SystemIds.PROPERTY;
const RELATION_VALUE_RELATIONSHIP_TYPE_ID = SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE;

/**
 * Property-aware search wrapper. Builds a single `EntityFilter` so the server
 * narrows by dataType / renderableType / relationValueTypes via
 * `relations.some` (and `relations.none` for the "no renderable type" case).
 * No client-side filtering, no hydration step, no page pumping.
 */
export function useSearchProperties({
  dataType,
  renderableTypeId,
  requiredRelationValueTypeIds,
  enabled,
}: UseSearchPropertiesOptions = {}) {
  const [query, setQuery] = React.useState<string>('');
  const debouncedQuery = useDebouncedValue(query);

  const filter = React.useMemo<EntityFilter>(() => {
    const ands: EntityFilter[] = [];

    if (dataType) {
      const dataTypeEntityId = DATA_TYPE_ENTITY_IDS[dataType];
      if (dataTypeEntityId) {
        ands.push({
          relations: {
            some: {
              typeId: { is: DATA_TYPE_PROPERTY },
              toEntityId: { is: dataTypeEntityId },
            },
          },
        });
      }
    }

    if (renderableTypeId === null) {
      ands.push({
        relations: { none: { typeId: { is: RENDERABLE_TYPE_PROPERTY } } },
      });
    } else if (renderableTypeId !== undefined) {
      ands.push({
        relations: {
          some: {
            typeId: { is: RENDERABLE_TYPE_PROPERTY },
            toEntityId: { is: renderableTypeId },
          },
        },
      });
    }

    if (requiredRelationValueTypeIds?.length) {
      for (const rvt of requiredRelationValueTypeIds) {
        ands.push({
          relations: {
            some: {
              typeId: { is: RELATION_VALUE_RELATIONSHIP_TYPE_ID },
              toEntityId: { is: rvt },
            },
          },
        });
      }
    }

    if (debouncedQuery !== '') {
      ands.push({ name: { includesInsensitive: debouncedQuery } });
    }

    return {
      typeIds: { anyEqualTo: PROPERTY_TYPE_ID },
      ...(ands.length > 0 ? { and: ands } : {}),
    };
  }, [dataType, renderableTypeId, requiredRelationValueTypeIds, debouncedQuery]);

  const shouldSearch = enabled ?? debouncedQuery !== '';

  const { data, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    enabled: shouldSearch,
    queryKey: ['search-properties:filtered', filter, PAGE_SIZE],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      return Effect.runPromise(searchPropertiesPage({ filter, limit: PAGE_SIZE, offset: pageParam }, signal));
    },
    getNextPageParam: lastPage => (lastPage.results.length < PAGE_SIZE ? undefined : lastPage.offset + PAGE_SIZE),
    gcTime: Duration.toMillis(Duration.seconds(15)),
  });

  const results = React.useMemo(() => {
    const seen = new Set<string>();
    const rows: NonNullable<typeof data>['pages'][number]['results'] = [];
    for (const row of data?.pages.flatMap(p => p.results) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    return rows;
  }, [data]);

  const isQuerySyncing = query !== debouncedQuery;

  return {
    query,
    onQueryChange: setQuery,
    isLoading: isLoading || isQuerySyncing,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isEmpty:
      !isLoading &&
      !isQuerySyncing &&
      !isFetchingNextPage &&
      !hasNextPage &&
      results.length === 0 &&
      (Boolean(enabled) || debouncedQuery !== ''),
    results,
  };
}
