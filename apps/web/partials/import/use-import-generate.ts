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
  buildImportPlan,
  collectRelationCells,
  createGenerationTracker,
} from './import-generation';
import type { ImportPlan, ResolvedEntity } from './import-generation';
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

  // ── Shared side-effect writer ─────────────────────────────────────────
  const applyPlan = useCallback(
    (plan: ImportPlan, options?: { previousValues?: { id: string }[]; previousRelations?: { id: string }[] }) => {
      // If replacing previous entries, clear them from the store first
      if (options?.previousValues && options?.previousRelations) {
        store.clearLocalChangesByIds({
          spaceId,
          valueIds: options.previousValues.map(v => v.id),
          relationIds: options.previousRelations.map(r => r.id),
        });
      }

      // Write to GeoStore
      plan.values.forEach(v => store.setValue(v));
      plan.relations.forEach(r => store.setRelation(r));

      // Write to atoms — single writer path for all 6
      setValues(plan.values);
      setRelations(plan.relations);
      setUnresolvedLinks(plan.unresolvedLinks);
      setResolvedRowsSnapshot(plan.resolvedRowsSnapshot);
      setResolvedTypesSnapshot(plan.resolvedTypesSnapshot);
      setResolvedEntitiesSnapshot(plan.resolvedEntitiesSnapshot);
    },
    [store, spaceId, setValues, setRelations, setUnresolvedLinks, setResolvedRowsSnapshot, setResolvedTypesSnapshot, setResolvedEntitiesSnapshot]
  );

  // ── Loading + pending rebuild refs ────────────────────────────────────
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  const pendingRebuildRef = useRef(false);

  // ── Full async generation ─────────────────────────────────────────────
  const generate = useCallback(async () => {
    if ((!selectedType && typesColumnIndex === undefined) || records.length < 2 || nameColIdx === undefined) return;
    const generationId = generationTrackerRef.current.start();
    isLoadingRef.current = true;
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

      const plan = buildImportPlan({
        dataRows,
        columnMapping,
        nameColIdx,
        selectedType,
        typesColumnIndex,
        resolvedEntities: mergedResolvedEntities,
        resolvedTypes: mergedResolvedTypes,
        resolvedRows: mergedResolvedRows,
        spaceId,
        propertyLookup,
        getExistingRelations: (entityId: string) => store.getResolvedRelations(entityId),
      });

      if (!generationTrackerRef.current.isCurrent(generationId)) return;

      applyPlan(plan);
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
    applyPlan,
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
    // If generate is in flight, defer this rebuild until it completes
    if (isLoadingRef.current) {
      pendingRebuildRef.current = true;
      return;
    }

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
    const mergedEntities = new Map<string, ResolvedEntity>(
      ctx.resolvedEntitiesSnapshot as Map<string, ResolvedEntity>
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

    const plan = buildImportPlan({
      dataRows,
      columnMapping: ctx.columnMapping,
      nameColIdx: ctx.nameColIdx,
      selectedType: ctx.selectedType,
      typesColumnIndex: ctx.typesColumnIndex,
      resolvedEntities: mergedEntities,
      resolvedTypes: mergedTypes,
      resolvedRows: mergedRows,
      spaceId,
      propertyLookup,
      getExistingRelations: (entityId: string) => store.getResolvedRelations(entityId),
    });

    applyPlan(plan, {
      previousValues: ctx.values,
      previousRelations: ctx.relations,
    });
  }, [store, spaceId, applyPlan]);

  // Drain pending rebuild when isLoading transitions to false.
  // Using an effect guarantees React has committed the state change,
  // avoiding the race where a microtask runs before the ref updates.
  useEffect(() => {
    if (!isLoading && pendingRebuildRef.current) {
      pendingRebuildRef.current = false;
      rebuild();
    }
  }, [isLoading, rebuild]);

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
