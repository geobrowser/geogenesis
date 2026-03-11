'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useSyncEngine } from '~/core/sync/use-sync-engine';

import {
  columnMappingAtom,
  extraPropertiesAtom,
  loadingAtom,
  recordsAtom,
  relationOverridesAtom,
  relationsAtom,
  resolvedEntitiesSnapshotAtom,
  resolvedRowsSnapshotAtom,
  resolvedTypesSnapshotAtom,
  rowOverridesAtom,
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
  crossReferenceRelationsWithRows,
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
  const rowOverrides = useAtomValue(rowOverridesAtom);
  const typeOverrides = useAtomValue(typeOverridesAtom);
  const typesColumnIndex = useAtomValue(typesColumnIndexAtom);
  const [isLoading, setIsLoading] = useAtom(loadingAtom);
  const setValues = useSetAtom(valuesAtom);
  const setRelations = useSetAtom(relationsAtom);
  const setUnresolvedLinks = useSetAtom(unresolvedLinksAtom);
  const setResolvedRowsSnapshot = useSetAtom(resolvedRowsSnapshotAtom);
  const setResolvedEntitiesSnapshot = useSetAtom(resolvedEntitiesSnapshotAtom);
  const setResolvedTypesSnapshot = useSetAtom(resolvedTypesSnapshotAtom);
  const resolvedEntitiesSnapshot = useAtomValue(resolvedEntitiesSnapshotAtom);
  const resolvedRowsSnapshot = useAtomValue(resolvedRowsSnapshotAtom);
  const resolvedTypesSnapshot = useAtomValue(resolvedTypesSnapshotAtom);
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
      const mergedResolvedRows = new Map(rowResolution.resolvedRows);
      for (const [rowIndexStr, override] of Object.entries(rowOverrides)) {
        mergedResolvedRows.set(Number(rowIndexStr), override);
      }

      // Unify relation entities that were auto-created with rows from the same import
      crossReferenceRelationsWithRows({
        dataRows,
        nameColIdx,
        resolvedEntities: mergedResolvedEntities,
        resolvedRows: mergedResolvedRows,
        selectedType,
        typesColumnIndex,
        resolvedTypes: mergedResolvedTypes,
        columnMapping,
        propertyLookup,
      });

      const unresolvedLinks = buildUnresolvedLinksByCell({
        dataRows,
        columnMapping,
        nameColIdx,
        typesColumnIndex,
        resolvedTypes: mergedResolvedTypes,
        resolvedRows: mergedResolvedRows,
        resolvedEntities: mergedResolvedEntities,
        propertyLookup,
      });

      const built = buildGeneratedRows({
        dataRows,
        columnMapping,
        resolvedRows: mergedResolvedRows,
        selectedType,
        typesColumnIndex,
        resolvedTypes: mergedResolvedTypes,
        resolvedEntities: mergedResolvedEntities,
        spaceId,
        propertyLookup,
        getExistingRelations: (entityId: string) => store.getResolvedRelations(entityId),
      });

      if (!generationTrackerRef.current.isCurrent(generationId)) return;

      const newValues = built.values;
      const newRelations = built.relations;

      newValues.forEach(v => store.setValue(v));
      newRelations.forEach(r => store.setRelation(r));

      setValues(newValues);
      setRelations(newRelations);
      setUnresolvedLinks(unresolvedLinks);
      setResolvedRowsSnapshot(mergedResolvedRows);
      setResolvedTypesSnapshot(mergedResolvedTypes);
      const entitySnapshot = new Map<string, { id: string; name: string; status: string; typeId?: string; typeName?: string | null }>();
      for (const [key, entity] of mergedResolvedEntities) {
        if (entity.status !== 'ambiguous') {
          entitySnapshot.set(key, {
            id: entity.id,
            name: entity.name,
            status: entity.status,
            typeId: entity.status === 'created' ? entity.typeId : undefined,
            typeName: entity.status === 'created' ? entity.typeName : undefined,
          });
        }
      }
      setResolvedEntitiesSnapshot(entitySnapshot);
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
    rowOverrides,
    schema,
    selectedType,
    typeOverrides,
    typesColumnIndex,
    setRelations,
    setValues,
    setStep,
    setIsLoading,
    setUnresolvedLinks,
    setResolvedRowsSnapshot,
    setResolvedEntitiesSnapshot,
    setResolvedTypesSnapshot,
    spaceId,
    store,
  ]);

  const values = useAtomValue(valuesAtom);
  const relations = useAtomValue(relationsAtom);

  // Refs for values that change frequently so rebuild stays stable
  const rebuildContextRef = useRef({
    values,
    relations,
    relationOverrides,
    typeOverrides,
    rowOverrides,
    resolvedEntitiesSnapshot,
    resolvedTypesSnapshot,
    resolvedRowsSnapshot,
    records,
    nameColIdx,
    schema,
    extraProperties,
    columnMapping,
    typesColumnIndex,
    selectedType,
  });
  rebuildContextRef.current = {
    values,
    relations,
    relationOverrides,
    typeOverrides,
    rowOverrides,
    resolvedEntitiesSnapshot,
    resolvedTypesSnapshot,
    resolvedRowsSnapshot,
    records,
    nameColIdx,
    schema,
    extraProperties,
    columnMapping,
    typesColumnIndex,
    selectedType,
  };

  /**
   * Incremental rebuild: merge snapshots with overrides and re-run the pure
   * build functions. No network calls — used when the user resolves a single
   * relation token, type, or entity row.
   *
   * Reads all inputs from a ref so the callback identity is stable and does
   * not trigger cascading re-renders.
   */
  const rebuild = useCallback(() => {
    const ctx = rebuildContextRef.current;
    const dataRows = ctx.records
      .slice(1)
      .filter(row => Array.isArray(row) && row.some(cell => (cell ?? '').trim() !== ''));
    if (dataRows.length === 0 || ctx.nameColIdx === undefined) return;

    const propertyLookup = {
      schema: ctx.schema,
      extraProperties: ctx.extraProperties,
      getProperty: (propertyId: string) => store.getProperty(propertyId),
    };

    // Merge relation entity overrides into the snapshot
    const mergedEntities = new Map<string, import('./import-generation').ResolvedEntity>(
      ctx.resolvedEntitiesSnapshot as Map<string, import('./import-generation').ResolvedEntity>
    );
    for (const [key, override] of Object.entries(ctx.relationOverrides)) {
      mergedEntities.set(key, override);
    }

    // Merge type overrides into the snapshot
    const mergedTypes = new Map(ctx.resolvedTypesSnapshot);
    for (const [rawType, override] of Object.entries(ctx.typeOverrides)) {
      mergedTypes.set(rawType, override);
    }

    // Merge row overrides into the snapshot
    const mergedRows = new Map(ctx.resolvedRowsSnapshot);
    for (const [rowIdxStr, override] of Object.entries(ctx.rowOverrides)) {
      mergedRows.set(Number(rowIdxStr), override);
    }

    // Unify relation entities that were auto-created with rows from the same import
    crossReferenceRelationsWithRows({
      dataRows,
      nameColIdx: ctx.nameColIdx,
      resolvedEntities: mergedEntities,
      resolvedRows: mergedRows,
      selectedType: ctx.selectedType,
      typesColumnIndex: ctx.typesColumnIndex,
      resolvedTypes: mergedTypes,
      columnMapping: ctx.columnMapping,
      propertyLookup,
    });

    const unresolvedLinks = buildUnresolvedLinksByCell({
      dataRows,
      columnMapping: ctx.columnMapping,
      nameColIdx: ctx.nameColIdx,
      typesColumnIndex: ctx.typesColumnIndex,
      resolvedTypes: mergedTypes,
      resolvedRows: mergedRows,
      resolvedEntities: mergedEntities,
      propertyLookup,
    });

    const built = buildGeneratedRows({
      dataRows,
      columnMapping: ctx.columnMapping,
      resolvedRows: mergedRows,
      selectedType: ctx.selectedType,
      typesColumnIndex: ctx.typesColumnIndex,
      resolvedTypes: mergedTypes,
      resolvedEntities: mergedEntities,
      spaceId,
      propertyLookup,
      getExistingRelations: (entityId: string) => store.getResolvedRelations(entityId),
    });

    // Clear previous GeoStore entries (without wiping snapshots)
    store.clearLocalChangesByIds({
      spaceId,
      valueIds: ctx.values.map(v => v.id),
      relationIds: ctx.relations.map(r => r.id),
    });

    // Write new entries to GeoStore
    built.values.forEach(v => store.setValue(v));
    built.relations.forEach(r => store.setRelation(r));

    setValues(built.values);
    setRelations(built.relations);
    setUnresolvedLinks(unresolvedLinks);
  }, [store, spaceId, setValues, setRelations, setUnresolvedLinks]);

  // Track whether initial generation has completed so we know when snapshots
  // are available for incremental rebuilds.
  const hasGeneratedRef = useRef(false);

  useEffect(() => {
    if (resolvedRowsSnapshot.size > 0 || resolvedEntitiesSnapshot.size > 0 || resolvedTypesSnapshot.size > 0) {
      hasGeneratedRef.current = true;
    }
  }, [resolvedRowsSnapshot, resolvedEntitiesSnapshot, resolvedTypesSnapshot]);

  // When overrides change after initial generation, do an incremental rebuild
  // instead of a full re-resolve.
  useEffect(() => {
    if (!hasGeneratedRef.current) return;
    rebuild();
  }, [relationOverrides, typeOverrides, rowOverrides, rebuild]);

  return { generate, rebuild, isLoading, canGenerate };
}
