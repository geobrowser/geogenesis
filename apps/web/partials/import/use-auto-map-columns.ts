'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';

import { getProperty, getResults } from '~/core/io/queries';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { Property } from '~/core/types';

import { columnMappingAtom, extraPropertiesAtom, headersAtom, typesColumnIndexAtom } from './atoms';

/**
 * Auto-maps unmapped CSV columns to existing properties in the space (by exact name match)
 * or creates new TEXT properties when no match is found.
 *
 * Rules:
 * - Exact match, 1 result → auto-map
 * - Exact match, 2+ results → leave unmapped (manual review)
 * - No match → leave unmapped (manual review)
 */
export function useAutoMapColumns(spaceId: string) {
  const headers = useAtomValue(headersAtom);
  const typesColumnIndex = useAtomValue(typesColumnIndexAtom);
  const [columnMapping, setColumnMapping] = useAtom(columnMappingAtom);
  const [, setExtraProperties] = useAtom(extraPropertiesAtom);
  const { store } = useSyncEngine();
  const [isAutoMapping, setIsAutoMapping] = useState(false);

  const autoMap = useCallback(async () => {
    // Collect unmapped column indices
    const unmappedIndices: number[] = [];
    for (let i = 0; i < headers.length; i++) {
      if (typesColumnIndex !== undefined && i === typesColumnIndex) continue;
      if (columnMapping[i] === undefined) {
        unmappedIndices.push(i);
      }
    }

    if (unmappedIndices.length === 0) return;

    setIsAutoMapping(true);

    try {
      const mappedByColumn: Record<number, string> = {};
      const mappedProperties: Record<string, Property> = {};

      // Process sequentially to avoid race conditions with createProperty
      for (const colIndex of unmappedIndices) {
        const headerName = (headers[colIndex] ?? '').trim();
        if (!headerName) continue;

        try {
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
              mappedByColumn[colIndex] = propertyId;
              mappedProperties[propertyId] = property;
            }
          }
          // exactMatches.length === 0 or >= 2 → skip, leave for manual review
        } catch (error) {
          console.warn(`[import] Auto-map failed for column "${headerName}"`, error);
        }
      }

      if (Object.keys(mappedByColumn).length > 0) {
        setColumnMapping(prev => {
          const next = { ...prev };
          for (const [column, propertyId] of Object.entries(mappedByColumn)) {
            const index = Number(column);
            if (next[index] === undefined) {
              next[index] = propertyId;
            }
          }
          return next;
        });
      }

      if (Object.keys(mappedProperties).length > 0) {
        setExtraProperties(prev => ({ ...prev, ...mappedProperties }));
      }
    } finally {
      setIsAutoMapping(false);
    }
  }, [headers, typesColumnIndex, columnMapping, spaceId, store, setColumnMapping, setExtraProperties]);

  return { autoMap, isAutoMapping };
}
