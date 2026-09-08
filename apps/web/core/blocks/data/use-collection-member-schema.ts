'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import type { Property } from '~/core/types';

import { type DropdownOptionsPage, fetchDropdownOptionsPage, fingerprintIdList } from './fetch-dropdown-options';

/** Safety cap on the membership walk: 20 slices × 1000 = 20,000 members. */
const MAX_MEMBER_TYPE_PAGES = 20;

/**
 * The schema a COLLECTION block's members actually carry. Query blocks
 * derive their schema from the filter's types (intension); a collection has
 * no type predicate, so its schema must come from the members themselves
 * (extension) — otherwise the shown-columns menu and the dropdown picker
 * stay pinned at the default Name/Description/Types/Cover forever.
 *
 * The WHOLE membership's types are read through the shared population
 * machinery (id slices + indexed relation chunks — the same walker the
 * dropdowns use), not just the loaded page, so a type appearing anywhere in
 * the collection contributes its properties. Cached per membership
 * fingerprint; Power Tools consumes this same hook via the overlay rather
 * than keeping its own loaded-page approximation for the dropdown UI.
 */
export function useCollectionMemberSchema(collectionItemIds: string[] | null): Property[] {
  const enabled = collectionItemIds !== null && collectionItemIds.length > 0;
  const membershipKey = collectionItemIds ? fingerprintIdList(collectionItemIds) : 'none';

  const { data } = useQuery({
    enabled,
    queryKey: ['data-block', 'collection-member-schema', membershipKey],
    queryFn: async ({ signal }) => {
      const ids = collectionItemIds ?? [];
      const typeIds = new Set<string>();
      let after: string | null = null;
      for (let page = 0; page < MAX_MEMBER_TYPE_PAGES; page++) {
        const result: DropdownOptionsPage = await fetchDropdownOptionsPage({
          propertyId: SystemIds.TYPES_PROPERTY,
          population: { kind: 'ids', ids, where: {} },
          after,
          signal,
        });
        for (const option of result.options) typeIds.add(option.id);
        if (!result.hasNextPage) break;
        after = result.endCursor;
      }
      if (typeIds.size === 0) return [];
      return await getSchemaFromTypeIds(
        [...typeIds].map(id => ({ id })),
        undefined,
        { includeAllTypeSpaces: true }
      );
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  return data ?? EMPTY_SCHEMA;
}

const EMPTY_SCHEMA: Property[] = [];
