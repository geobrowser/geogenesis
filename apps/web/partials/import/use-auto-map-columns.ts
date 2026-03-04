'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';

import { useCreateProperty } from '~/core/hooks/use-create-property';
import { getProperty, getResults } from '~/core/io/queries';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { Property } from '~/core/types';

import { columnMappingAtom, extraPropertiesAtom, headersAtom } from './atoms';

/**
 * Auto-maps unmapped CSV columns to existing properties in the space (by exact name match)
 * or creates new TEXT properties when no match is found.
 *
 * Rules:
 * - Exact match, 1 result → auto-map
 * - Exact match, 2+ results → leave unmapped (manual review)
 * - No match → create new TEXT property and map
 */
export function useAutoMapColumns(spaceId: string) {
  const headers = useAtomValue(headersAtom);
  const [columnMapping, setColumnMapping] = useAtom(columnMappingAtom);
  const [extraProperties, setExtraProperties] = useAtom(extraPropertiesAtom);
  const { store } = useSyncEngine();
  const { createProperty } = useCreateProperty(spaceId);
  const [isAutoMapping, setIsAutoMapping] = useState(false);

  const autoMap = useCallback(async () => {
    // Collect unmapped column indices
    const unmappedIndices: number[] = [];
    for (let i = 0; i < headers.length; i++) {
      if (columnMapping[i] === undefined) {
        unmappedIndices.push(i);
      }
    }

    if (unmappedIndices.length === 0) return;

    setIsAutoMapping(true);

    try {
      // Process sequentially to avoid race conditions with createProperty
      for (const colIndex of unmappedIndices) {
        const headerName = (headers[colIndex] ?? '').trim();
        if (!headerName) continue;

        // Search for properties with this name across the space
        const results = await Effect.runPromise(
          getResults({
            query: headerName,
            typeIds: [SystemIds.PROPERTY],
            spaceId,
          })
        );

        // Filter to exact name matches (case-insensitive, trimmed)
        const exactMatches = results.filter(
          r => (r.name ?? '').trim().toLowerCase() === headerName.toLowerCase()
        );

        if (exactMatches.length === 1) {
          // Single exact match → auto-map
          const match = exactMatches[0];
          const propertyId = match.id;

          // Resolve the full Property object
          let property: Property | null = store.getProperty(propertyId);
          if (!property) {
            property = await Effect.runPromise(getProperty(propertyId));
          }

          if (property) {
            setColumnMapping(prev => ({ ...prev, [colIndex]: propertyId }));
            setExtraProperties(prev => ({ ...prev, [propertyId]: property }));
          }
        } else if (exactMatches.length === 0) {
          // No match → create a new TEXT property
          const propertyId = createProperty({ name: headerName, propertyType: 'TEXT' });

          // Resolve from store (createProperty writes to local store synchronously)
          let property: Property | null = store.getProperty(propertyId);
          if (!property) {
            // Fallback: construct a minimal Property
            property = {
              id: propertyId,
              name: headerName,
              dataType: 'TEXT',
            };
          }

          setColumnMapping(prev => ({ ...prev, [colIndex]: propertyId }));
          setExtraProperties(prev => ({ ...prev, [propertyId]: property }));
        }
        // exactMatches.length >= 2 → skip, leave for manual review
      }
    } finally {
      setIsAutoMapping(false);
    }
  }, [headers, columnMapping, spaceId, store, createProperty, setColumnMapping, setExtraProperties]);

  return { autoMap, isAutoMapping };
}
