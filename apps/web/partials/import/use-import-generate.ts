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
  relationOverridesAtom,
  relationsAtom,
  selectedTypeAtom,
  stepAtom,
  typeOverridesAtom,
  typesColumnIndexAtom,
  unresolvedLinksAtom,
  valuesAtom,
} from './atoms';
import {
  buildGeneratedRows,
  buildUnresolvedLinksByCell,
  collectRelationCells,
  createGenerationTracker,
} from './import-generation';
import { resolveRelationEntities, resolveRowsByNameAndType, resolveTypesForRows } from './import-resolution';
import { useImportSchema } from './use-import-schema';
import { useImportSession } from './use-import-session';

export function useImportGenerate(spaceId: string) {
  const { store } = useSyncEngine();
  const records = useAtomValue(recordsAtom);
  const columnMapping = useAtomValue(columnMappingAtom);
  const extraProperties = useAtomValue(extraPropertiesAtom);
  const selectedType = useAtomValue(selectedTypeAtom);
  const relationOverrides = useAtomValue(relationOverridesAtom);
  const typeOverrides = useAtomValue(typeOverridesAtom);
  const typesColumnIndex = useAtomValue(typesColumnIndexAtom);
  const [isLoading, setIsLoading] = useAtom(loadingAtom);
  const setValues = useSetAtom(valuesAtom);
  const setRelations = useSetAtom(relationsAtom);
  const setUnresolvedLinks = useSetAtom(unresolvedLinksAtom);
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

      const dataRows = records
        .slice(1)
        .filter(row => Array.isArray(row) && row.some(cell => (cell ?? '').trim() !== ''));
      const propertyLookup = {
        schema,
        extraProperties,
        getProperty: (propertyId: string) => store.getProperty(propertyId),
      };
      setUnresolvedLinks({});

      const relationProperties = collectRelationCells({ columnMapping, dataRows, propertyLookup });
      const relationResolution = await resolveRelationEntities({
        relationProperties,
        guard: { isCurrent: () => generationTrackerRef.current.isCurrent(generationId) },
      });
      if (relationResolution.aborted) return;
      const mergedResolvedEntities = new Map(relationResolution.resolvedEntities);
      for (const [cacheKey, override] of Object.entries(relationOverrides)) {
        mergedResolvedEntities.set(cacheKey, override);
      }

      const typeResolution = await resolveTypesForRows({
        dataRows,
        typesColumnIndex,
        spaceId,
        guard: { isCurrent: () => generationTrackerRef.current.isCurrent(generationId) },
      });
      if (typeResolution.aborted) return;
      const mergedResolvedTypes = new Map(typeResolution.resolvedTypes);
      for (const [rawType, override] of Object.entries(typeOverrides)) {
        mergedResolvedTypes.set(rawType, override);
      }

      const rowResolution = await resolveRowsByNameAndType({
        dataRows,
        nameColIdx,
        selectedType,
        typesColumnIndex,
        resolvedTypes: mergedResolvedTypes,
        guard: { isCurrent: () => generationTrackerRef.current.isCurrent(generationId) },
      });
      if (rowResolution.aborted) return;

      const unresolvedLinks = buildUnresolvedLinksByCell({
        dataRows,
        columnMapping,
        nameColIdx,
        typesColumnIndex,
        resolvedTypes: mergedResolvedTypes,
        resolvedRows: rowResolution.resolvedRows,
        resolvedEntities: mergedResolvedEntities,
        propertyLookup,
      });

      const built = buildGeneratedRows({
        dataRows,
        columnMapping,
        resolvedRows: rowResolution.resolvedRows,
        selectedType,
        typesColumnIndex,
        resolvedTypes: mergedResolvedTypes,
        resolvedEntities: mergedResolvedEntities,
        spaceId,
        propertyLookup,
      });

      if (!generationTrackerRef.current.isCurrent(generationId)) return;

      const newValues = built.values;
      const newRelations = built.relations;

      newValues.forEach(v => store.setValue(v));
      newRelations.forEach(r => store.setRelation(r));

      setValues(newValues);
      setRelations(newRelations);
      setUnresolvedLinks(unresolvedLinks);
      setStep('step5');

      if (rowResolution.unresolvedRowCount > 0 || relationResolution.unresolvedCount > 0) {
        console.warn(
          `[import] unresolved links: rows=${rowResolution.unresolvedRowCount}, relationCells=${relationResolution.unresolvedCount}`
        );
      }
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
    relationOverrides,
    schema,
    selectedType,
    typeOverrides,
    typesColumnIndex,
    setRelations,
    setValues,
    setStep,
    setIsLoading,
    setUnresolvedLinks,
    spaceId,
    store,
  ]);

  return { generate, isLoading, canGenerate };
}
