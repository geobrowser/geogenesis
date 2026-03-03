'use client';

import { Position, SystemIds } from '@geoprotocol/geo-sdk';
import { useQuery } from '@tanstack/react-query';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { ID } from '~/core/id';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { Relation, Value } from '~/core/types';

import {
  columnMappingAtom,
  loadingAtom,
  recordsAtom,
  relationsAtom,
  selectedTypeAtom,
  stepAtom,
  valuesAtom,
} from './atoms';

export function useImportGenerate(spaceId: string) {
  const { store } = useSyncEngine();
  const records = useAtomValue(recordsAtom);
  const columnMapping = useAtomValue(columnMappingAtom);
  const selectedType = useAtomValue(selectedTypeAtom);
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
        if (propertyId === SystemIds.NAME_PROPERTY) continue;
        const colIdx = parseInt(colIdxStr, 10);
        const raw = row[colIdx]?.trim() ?? '';
        if (!raw) continue;
        const prop = schema.find(p => p.id === propertyId);
        if (!prop) continue;
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
    setIsLoading(false);
    setStep('step5');
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
  ]);

  return { generate, isLoading, canGenerate };
}
