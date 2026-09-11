'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import type { Property } from '~/core/types';

import { fetchDropdownFacet, fingerprintIdList } from './fetch-dropdown-options';

/**
 * The schema a COLLECTION block's members actually carry. Query blocks
 * derive their schema from the filter's types (intension); a collection has
 * no type predicate, so its schema must come from the members themselves
 * (extension) — otherwise the shown-columns menu and the dropdown picker
 * stay pinned at the default Name/Description/Types/Cover forever.
 *
 * The WHOLE membership's types come from one grouped-aggregation facet —
 * not just the loaded page — so a type appearing anywhere in the collection
 * contributes its properties. Cached per membership
 * fingerprint; Power Tools consumes this same hook via the overlay rather
 * than keeping its own loaded-page approximation for the dropdown UI.
 */
export type CollectionMemberSchema = {
  properties: Property[];
  /** The distinct types found across the whole membership — canonical-eligibility needs them. */
  typeIds: string[];
};

export function useCollectionMemberSchema(collectionItemIds: string[] | null): CollectionMemberSchema {
  const enabled = collectionItemIds !== null && collectionItemIds.length > 0;
  const membershipKey = collectionItemIds ? fingerprintIdList(collectionItemIds) : 'none';

  const { data } = useQuery({
    enabled,
    queryKey: ['data-block', 'collection-member-schema', membershipKey],
    queryFn: async ({ signal }) => {
      const ids = collectionItemIds ?? [];
      // One grouped-aggregation facet over the membership's Types relations
      // returns every distinct member type in a single request (it replaced
      // a sliced id-walk; same query the dropdowns themselves run).
      const facet = await fetchDropdownFacet({
        columnId: SystemIds.TYPES_PROPERTY,
        population: { kind: 'ids', ids, where: {} },
        signal,
      });
      const typeIds = facet.map(entry => entry.id);
      if (typeIds.length === 0) return { properties: [], typeIds: [] };
      const properties = await getSchemaFromTypeIds(
        typeIds.map(id => ({ id })),
        undefined,
        { includeAllTypeSpaces: true }
      );
      return { properties, typeIds };
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  return data ?? EMPTY_SCHEMA;
}

const EMPTY_SCHEMA: CollectionMemberSchema = { properties: [], typeIds: [] };
