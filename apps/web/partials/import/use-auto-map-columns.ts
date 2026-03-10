'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';

import { getProperty, getResults } from '~/core/io/queries';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { Property } from '~/core/types';
import { getSpaceRank } from '~/core/utils/space/space-ranking';

import { columnMappingAtom, extraPropertiesAtom, headersAtom, typesColumnIndexAtom } from './atoms';
import { hydrateRelationValueTypes } from './import-generation';

/**
 * Auto-maps unmapped CSV columns to existing properties in the space (by exact name match)
 * or creates new TEXT properties when no match is found.
 *
 * Rules:
 * - Exact match, 1 result → auto-map
 * - Exact match, 2+ results → pick the one from the highest-ranked space; if tied, leave unmapped
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

      await Promise.all(
        unmappedIndices.map(async colIndex => {
          const headerName = (headers[colIndex] ?? '').trim();
          if (!headerName) return;

          try {
            const results = await Effect.runPromise(
              getResults({
                query: headerName,
                typeIds: [SystemIds.PROPERTY],
                spaceId,
              })
            );

            const exactMatches = results.filter(
              r => (r.name ?? '').trim().toLowerCase() === headerName.toLowerCase()
            );

            let match = exactMatches.length === 1 ? exactMatches[0] : null;

            if (!match && exactMatches.length > 1) {
              // Rank each match by its best space
              const ranked = exactMatches.map(m => ({
                match: m,
                rank: Math.min(...m.spaces.map(s => getSpaceRank(s.spaceId))),
              }));
              const bestRank = Math.min(...ranked.map(r => r.rank));
              const atBest = ranked.filter(r => r.rank === bestRank);
              if (atBest.length === 1) {
                match = atBest[0].match;
              }
            }

            if (match) {
              const propertyId = match.id;

              let property: Property | null = store.getProperty(propertyId);
              if (!property) {
                property = await Effect.runPromise(getProperty(propertyId));
              }

              if (property) {
                property = await hydrateRelationValueTypes(property);
                mappedByColumn[colIndex] = propertyId;
                mappedProperties[propertyId] = property;
              }
            }
          } catch (error) {
            console.warn(`[import] Auto-map failed for column "${headerName}"`, error);
          }
        })
      );

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
