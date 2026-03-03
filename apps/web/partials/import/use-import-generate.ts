'use client';

import { Position, SystemIds } from '@geoprotocol/geo-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { ID } from '~/core/id';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { E } from '~/core/sync/orm';
import { Relation, Value } from '~/core/types';
import type { Property } from '~/core/types';

import {
  columnMappingAtom,
  loadingAtom,
  recordsAtom,
  relationsAtom,
  selectedTypeAtom,
  stepAtom,
  valuesAtom,
} from './atoms';

async function findOrCreateRelationTarget(
  nameTrimmed: string,
  prop: Property,
  spaceId: string,
  store: ReturnType<typeof useSyncEngine>['store'],
  cache: ReturnType<typeof useQueryClient>,
  newValues: Value[],
  newRelations: Relation[]
): Promise<{ id: string; spaceId: string }> {
  const typeIds = prop.relationValueTypes?.map(t => t.id).filter(Boolean) ?? [];
  const where: Parameters<typeof E.findFuzzy>[0]['where'] = {
    name: { fuzzy: nameTrimmed },
    ...(typeIds.length > 0 ? { types: typeIds.map(id => ({ id: { equals: id } })) } : {}),
  };
  let results: Awaited<ReturnType<typeof E.findFuzzy>> = [];
  try {
    results = await E.findFuzzy({ store, cache, where, first: 10, skip: 0 });
  } catch (e) {
    console.warn('findFuzzy failed for relation target', nameTrimmed, e);
  }
  if (results.length > 0) {
    const first = results[0];
    const toSpaceId = first.spaces?.[0]?.spaceId ?? spaceId;
    return { id: first.id, spaceId: toSpaceId };
  }
  const newEntityId = ID.createEntityId();
  const nameValue: Value = {
    id: ID.createValueId({ entityId: newEntityId, propertyId: SystemIds.NAME_PROPERTY, spaceId }),
    entity: { id: newEntityId, name: nameTrimmed },
    property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
    spaceId,
    value: nameTrimmed,
    isLocal: true,
  };
  newValues.push(nameValue);
  store.setValue(nameValue);
  const firstType = prop.relationValueTypes?.[0];
  if (firstType) {
    const typesRelation: Relation = {
      id: ID.createEntityId(),
      entityId: ID.createEntityId(),
      spaceId,
      position: Position.generate(),
      renderableType: 'RELATION',
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      fromEntity: { id: newEntityId, name: nameTrimmed },
      toEntity: { id: firstType.id, name: firstType.name, value: firstType.id },
      isLocal: true,
    };
    newRelations.push(typesRelation);
    store.setRelation(typesRelation);
  }
  return { id: newEntityId, spaceId };
}

export function useImportGenerate(spaceId: string) {
  const { store } = useSyncEngine();
  const cache = useQueryClient();
  const records = useAtomValue(recordsAtom);
  const columnMapping = useAtomValue(columnMappingAtom);
  const selectedType = useAtomValue(selectedTypeAtom);
  const [isLoading, setIsLoading] = useAtom(loadingAtom);
  const setValues = useSetAtom(valuesAtom);
  const setRelations = useSetAtom(relationsAtom);
  const setStep = useSetAtom(stepAtom);

  const { data: schema = [] } = useQuery({
    queryKey: ['import-schema', selectedType?.id],
    queryFn: () => getSchemaFromTypeIds([{ id: selectedType!.id }]),
    enabled: Boolean(selectedType?.id),
  });

  const nameColumnIndex = useMemo(
    () =>
      columnMapping
        ? Object.entries(columnMapping).find(([, propId]) => propId === SystemIds.NAME_PROPERTY)?.[0]
        : undefined,
    [columnMapping]
  );
  const nameColIdx = nameColumnIndex != null ? parseInt(nameColumnIndex, 10) : undefined;

  const canGenerate =
    Boolean(selectedType) &&
    records.length > 1 &&
    nameColIdx !== undefined &&
    Object.keys(columnMapping).length > 0;

  const generate = useCallback(async () => {
    if (!selectedType || records.length < 2 || nameColIdx === undefined) return;
    setIsLoading(true);
    const dataRows = records.slice(1);
    const newValues: Value[] = [];
    const newRelations: Relation[] = [];

    try {
      for (const row of dataRows) {
        const entityId = ID.createEntityId();
        const rowName = (row[nameColIdx] ?? '').trim() || 'Unnamed';
        const typeId = selectedType.id;
        const typeName = selectedType.name;

        newRelations.push({
          id: ID.createEntityId(),
          entityId,
          type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
          fromEntity: { id: entityId, name: rowName },
          toEntity: { id: typeId, name: typeName, value: typeId },
          renderableType: 'RELATION',
          spaceId,
          position: Position.generate(),
          isLocal: true,
        });

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
          if (propertyId === SystemIds.NAME_PROPERTY || propertyId === SystemIds.TYPES_PROPERTY) continue;
          const colIdx = parseInt(colIdxStr, 10);
          const raw = row[colIdx]?.trim() ?? '';
          if (!raw) continue;
          const prop = schema.find(p => p.id === propertyId);
          if (!prop) continue;

          if (prop.dataType === 'RELATION') {
            const names = raw.split(',').map(s => s.trim()).filter(Boolean);
            for (const namePart of names) {
              const target = await findOrCreateRelationTarget(
                namePart,
                prop,
                spaceId,
                store,
                cache,
                newValues,
                newRelations
              );
              const newRel: Relation = {
                id: ID.createEntityId(),
                entityId: ID.createEntityId(),
                spaceId,
                position: Position.generate(),
                renderableType: 'RELATION',
                toSpaceId: target.spaceId,
                type: { id: propertyId, name: prop.name ?? '' },
                fromEntity: { id: entityId, name: rowName },
                toEntity: { id: target.id, name: namePart, value: target.id },
                isLocal: true,
              };
              newRelations.push(newRel);
              store.setRelation(newRel);
            }
            continue;
          }

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
    nameColIdx,
    records,
    schema,
    selectedType,
    setRelations,
    setValues,
    setStep,
    setIsLoading,
    spaceId,
    store,
    cache,
  ]);

  return { generate, isLoading, canGenerate };
}
