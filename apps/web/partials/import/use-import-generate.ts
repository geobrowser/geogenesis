'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useMemo, useRef } from 'react';

import { useSyncEngine } from '~/core/sync/use-sync-engine';

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
import {
  buildGeneratedRows,
  collectRelationCells,
  createGenerationTracker,
} from './import-generation';
import { resolveRelationEntities, resolveTypesForRows } from './import-resolution';
import { useImportSchema } from './use-import-schema';
import { useImportSession } from './use-import-session';

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
  const { clearGeneratedChanges } = useImportSession(spaceId);

  const { schema } = useImportSchema({ selectedTypeId: selectedType?.id, spaceId });

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
  const generationTrackerRef = useRef(createGenerationTracker());

  const generate = useCallback(async () => {
    if ((!selectedType && typesColumnIndex === undefined) || records.length < 2 || nameColIdx === undefined) return;
    const generationId = generationTrackerRef.current.start();
    setIsLoading(true);

    try {
      clearGeneratedChanges();

      const dataRows = records.slice(1);
      const propertyLookup = {
        schema,
        extraProperties,
        getProperty: (propertyId: string) => store.getProperty(propertyId),
      };

      const relationProperties = collectRelationCells({ columnMapping, dataRows, propertyLookup });
      const relationResolution = await resolveRelationEntities({
        relationProperties,
        spaceId,
        guard: { isCurrent: () => generationTrackerRef.current.isCurrent(generationId) },
      });
      if (relationResolution.aborted) return;

      const typeResolution = await resolveTypesForRows({
        dataRows,
        typesColumnIndex,
        spaceId,
        guard: { isCurrent: () => generationTrackerRef.current.isCurrent(generationId) },
      });
      if (typeResolution.aborted) return;

      const built = buildGeneratedRows({
        dataRows,
        nameColIdx,
        columnMapping,
        selectedType,
        typesColumnIndex,
        resolvedTypes: typeResolution.resolvedTypes,
        resolvedEntities: relationResolution.resolvedEntities,
        spaceId,
        propertyLookup,
      });

      if (!generationTrackerRef.current.isCurrent(generationId)) return;

      const newValues = [...relationResolution.bootstrappedValues, ...built.values];
      const newRelations = [...relationResolution.bootstrappedRelations, ...built.relations];

      newValues.forEach(v => store.setValue(v));
      newRelations.forEach(r => store.setRelation(r));

      setValues(newValues);
      setRelations(newRelations);
      setStep('step5');
    } finally {
      if (generationTrackerRef.current.isCurrent(generationId)) {
        setIsLoading(false);
      }
    }
  }, [
    columnMapping,
    clearGeneratedChanges,
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
