'use client';

import { Position, SystemIds } from '@geoprotocol/geo-sdk';
import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { ID } from '~/core/id';
import { getResults } from '~/core/io/queries';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { RenderableEntityType, Relation, Value } from '~/core/types';

import {
  columnMappingAtom,
  extraPropertiesAtom,
  loadingAtom,
  recordsAtom,
  relationsAtom,
  selectedTypeAtom,
  stepAtom,
  typesColumnIndexAtom,
  valuesAtom,
} from './atoms';

/** Split a relation cell on common multi-value separators (, ; |) and trim each part. */
function splitRelationCell(raw: string): string[] {
  return raw.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}

export function useImportGenerate(spaceId: string) {
  const { store } = useSyncEngine();
  const records = useAtomValue(recordsAtom);
  const columnMapping = useAtomValue(columnMappingAtom);
  const extraProperties = useAtomValue(extraPropertiesAtom);
  const selectedType = useAtomValue(selectedTypeAtom);
  const typesColumnIndex = useAtomValue(typesColumnIndexAtom);
  const [isLoading, setIsLoading] = useAtom(loadingAtom);
  const setValues = useSetAtom(valuesAtom);
  const setRelations = useSetAtom(relationsAtom);
  const setStep = useSetAtom(stepAtom);

  const { data: schema = [] } = useQuery({
    queryKey: ['import-schema', selectedType?.id, spaceId],
    queryFn: () => getSchemaFromTypeIds([{ id: selectedType!.id, spaceId }]),
    enabled: Boolean(selectedType?.id && spaceId),
  });

  const nameColumnIndex = useMemo(
    () =>
      columnMapping
        ? Object.entries(columnMapping).find(([, propId]) => propId === SystemIds.NAME_PROPERTY)?.[0]
        : undefined,
    [columnMapping]
  );
  const nameColIdx = nameColumnIndex != null ? parseInt(nameColumnIndex, 10) : undefined;

  const hasTypeSource = Boolean(selectedType) || typesColumnIndex !== undefined;

  const canGenerate =
    hasTypeSource &&
    records.length > 1 &&
    nameColIdx !== undefined &&
    Object.keys(columnMapping).length > 0;

  const generate = useCallback(async () => {
    if ((!selectedType && typesColumnIndex === undefined) || records.length < 2 || nameColIdx === undefined) return;
    setIsLoading(true);

    try {
    // Clear previous generation's local changes from the store to prevent
    // duplicate entities accumulating across re-generations.
    store.clearLocalChangesForSpace(spaceId);

    const dataRows = records.slice(1);
    const newValues: Value[] = [];
    const newRelations: Relation[] = [];

    // Phase 1: Pre-collect unique relation cell values
    const relationProperties = new Map<string, { prop: NonNullable<ReturnType<typeof store.getProperty>>; typeIds: string[] }>();
    const cellsToResolve = new Map<string, Set<string>>();

    for (const [colIdxStr, propertyId] of Object.entries(columnMapping)) {
      if (propertyId === SystemIds.NAME_PROPERTY) continue;
      const prop =
        schema.find(p => p.id === propertyId) ??
        extraProperties[propertyId] ??
        store.getProperty(propertyId);
      if (!prop || prop.dataType !== 'RELATION') continue;

      relationProperties.set(propertyId, {
        prop,
        typeIds: prop.relationValueTypes?.map(t => t.id) ?? [],
      });

      const uniqueValues = new Set<string>();
      const colIdx = parseInt(colIdxStr, 10);
      for (const row of dataRows) {
        const raw = (row[colIdx] ?? '').trim();
        if (!raw) continue;
        for (const part of splitRelationCell(raw)) {
          uniqueValues.add(part);
        }
      }
      cellsToResolve.set(propertyId, uniqueValues);
    }

    // Phase 2: Resolve all unique relation cell values
    type ResolvedEntity = { id: string; name: string; status: 'found' | 'created' } | { status: 'ambiguous' };
    const resolvedEntities = new Map<string, ResolvedEntity>();
    // Track locally-created entities by normalized name to avoid duplicates across properties
    const createdByName = new Map<string, { id: string; name: string }>();

    for (const [propertyId, uniqueValues] of cellsToResolve) {
      const { prop, typeIds } = relationProperties.get(propertyId)!;

      for (const cellValue of uniqueValues) {
        const cacheKey = `${propertyId}::${cellValue}`;
        const normalizedName = cellValue.toLowerCase();

        // If we already created a local entity with this name, reuse it
        const existing = createdByName.get(normalizedName);
        if (existing) {
          resolvedEntities.set(cacheKey, { id: existing.id, name: existing.name, status: 'created' });
          continue;
        }

        try {
          const results = await Effect.runPromise(
            getResults({
              query: cellValue,
              typeIds: typeIds.length > 0 ? typeIds : undefined,
              spaceId,
            })
          );

          const exactMatches = results.filter(
            r => (r.name ?? '').trim().toLowerCase() === normalizedName
          );

          if (exactMatches.length === 1) {
            resolvedEntities.set(cacheKey, { id: exactMatches[0].id, name: exactMatches[0].name ?? cellValue, status: 'found' });
          } else if (exactMatches.length === 0) {
            // Create a new entity
            const newEntityId = ID.createEntityId();

            // Name value for the new entity
            newValues.push({
              id: ID.createValueId({ entityId: newEntityId, propertyId: SystemIds.NAME_PROPERTY, spaceId }),
              entity: { id: newEntityId, name: cellValue },
              property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
              spaceId,
              value: cellValue,
              isLocal: true,
            });

            // Types relation using the first relation value type (matches codebase pattern)
            const firstRelationType = prop.relationValueTypes?.[0];
            if (firstRelationType) {
              const relType = firstRelationType;
              newRelations.push({
                id: ID.createEntityId(),
                entityId: newEntityId,
                type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
                fromEntity: { id: newEntityId, name: cellValue },
                toEntity: { id: relType.id, name: relType.name ?? '', value: relType.id },
                renderableType: 'RELATION',
                spaceId,
                position: Position.generate(),
                isLocal: true,
              });
            }

            createdByName.set(normalizedName, { id: newEntityId, name: cellValue });
            resolvedEntities.set(cacheKey, { id: newEntityId, name: cellValue, status: 'created' });
          } else {
            // 2+ matches → ambiguous, skip
            resolvedEntities.set(cacheKey, { status: 'ambiguous' });
          }
        } catch (e) {
          // Search failed for this cell value — skip it, don't block the rest
          console.warn(`[import] Failed to resolve relation value "${cellValue}" for property ${propertyId}:`, e);
        }
      }
    }

    // Phase 2b: If using a types column, resolve unique type names to entities
    const resolvedTypes = new Map<string, { id: string; name: string }>();

    if (typesColumnIndex !== undefined) {
      const uniqueTypeNames = new Set<string>();
      for (const row of dataRows) {
        const raw = (row[typesColumnIndex] ?? '').trim();
        if (raw) uniqueTypeNames.add(raw);
      }

      for (const typeName of uniqueTypeNames) {
        try {
          const results = await Effect.runPromise(
            getResults({ query: typeName, spaceId })
          );
          const exactMatches = results.filter(
            r => (r.name ?? '').trim().toLowerCase() === typeName.toLowerCase()
          );
          if (exactMatches.length === 1) {
            resolvedTypes.set(typeName, { id: exactMatches[0].id, name: exactMatches[0].name ?? typeName });
          }
          // 0 or 2+ matches → skip, row won't get a type relation
        } catch (e) {
          console.warn(`[import] Failed to resolve type "${typeName}":`, e);
        }
      }
    }

    // Phase 3: Generate entities from rows
    for (const row of dataRows) {
      const entityId = ID.createEntityId();
      const rowName = (row[nameColIdx] ?? '').trim() || 'Unnamed';

      // Resolve the type for this row: either a constant selectedType or per-row from CSV column
      let rowType: { id: string; name: string | null } | null = selectedType;
      if (typesColumnIndex !== undefined) {
        const rawType = (row[typesColumnIndex] ?? '').trim();
        rowType = rawType ? (resolvedTypes.get(rawType) ?? null) : null;
      }

      if (rowType) {
        newRelations.push({
          id: ID.createEntityId(),
          entityId,
          type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
          fromEntity: { id: entityId, name: rowName },
          toEntity: { id: rowType.id, name: rowType.name, value: rowType.id },
          renderableType: 'RELATION',
          spaceId,
          position: Position.generate(),
          isLocal: true,
        });
      }

      const nameValue: Value = {
        id: ID.createValueId({ entityId, propertyId: SystemIds.NAME_PROPERTY, spaceId }),
        entity: { id: entityId, name: rowName },
        property: {
          id: SystemIds.NAME_PROPERTY,
          name: 'Name',
          dataType: 'TEXT',
        },
        spaceId,
        value: rowName,
        isLocal: true,
      };
      newValues.push(nameValue);

      for (const [colIdxStr, propertyId] of Object.entries(columnMapping)) {
        if (propertyId === SystemIds.NAME_PROPERTY) continue;
        const colIdx = parseInt(colIdxStr, 10);
        const raw = row[colIdx]?.trim() ?? '';
        if (!raw) continue;
        // Three-level fallback: schema → extraProperties → store
        const prop =
          schema.find(p => p.id === propertyId) ??
          extraProperties[propertyId] ??
          store.getProperty(propertyId);
        if (!prop) continue;

        if (prop.dataType === 'RELATION') {
          const renderableType: RenderableEntityType =
            prop.renderableTypeStrict === 'IMAGE' ? 'IMAGE' :
            prop.renderableTypeStrict === 'VIDEO' ? 'VIDEO' :
            'RELATION';

          for (const part of splitRelationCell(raw)) {
            const resolved = resolvedEntities.get(`${propertyId}::${part}`);
            if (!resolved || resolved.status === 'ambiguous') continue;

            newRelations.push({
              id: ID.createEntityId(),
              entityId,
              type: { id: propertyId, name: prop.name ?? '' },
              fromEntity: { id: entityId, name: rowName },
              toEntity: { id: resolved.id, name: resolved.name, value: resolved.id },
              renderableType,
              spaceId,
              position: Position.generate(),
              isLocal: true,
            });
          }
        } else {
          newValues.push({
            id: ID.createValueId({ entityId, propertyId, spaceId }),
            entity: { id: entityId, name: rowName },
            property: prop,
            spaceId,
            value: raw,
            isLocal: true,
          });
        }
      }
    }

    newValues.forEach(v => store.setValue(v));
    newRelations.forEach(r => store.setRelation(r));

    setValues(newValues);
    setRelations(newRelations);
    setStep('step5');
    } finally {
      setIsLoading(false);
    }
  }, [
    columnMapping,
    extraProperties,
    nameColIdx,
    records,
    schema,
    selectedType,
    typesColumnIndex,
    setRelations,
    setValues,
    setStep,
    setIsLoading,
    spaceId,
    store,
  ]);

  return { generate, isLoading, canGenerate };
}
