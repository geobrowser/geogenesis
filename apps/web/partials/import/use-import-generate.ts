'use client';

const DEBUG_IMPORT = process.env.NODE_ENV === 'development';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useSyncEngine } from '~/core/sync/use-sync-engine';

import {
  checkboxOverridesAtom,
  columnMappingAtom,
  extraPropertiesAtom,
  importSessionIdAtom,
  loadingAtom,
  relationOverridesAtom,
  relationsAtom,
  resolvedEntitiesSnapshotAtom,
  resolvedRowsSnapshotAtom,
  resolvedTypesSnapshotAtom,
  rowCountAtom,
  rowOverridesAtom,
  selectedTypeAtom,
  stepAtom,
  typeOverridesAtom,
  typesColumnIndexAtom,
  unresolvedLinksAtom,
  valuesAtom,
} from './atoms';
import { buildImportPlan, collectRelationCells, createGenerationTracker } from './import-generation';
import type { ImportPlan, ResolvedEntity } from './import-generation';
import { ImportSessionStore } from './import-session-store';
import { resolveRelationEntities, resolveRowsByNameAndType, resolveTypesForRows } from './import-resolution';
import { useImportSchema } from './use-import-schema';
import { useImportSession } from './use-import-session';

export function useImportGenerate(spaceId: string) {
  const { store } = useSyncEngine();
  const sessionId = useAtomValue(importSessionIdAtom);
  const rowCount = useAtomValue(rowCountAtom);
  const checkboxOverrides = useAtomValue(checkboxOverridesAtom);
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
    rowCount > 0 &&
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

      // Write to GeoStore in batches so large imports don't trigger
      // quadratic array rewrites on the main thread.
      store.setValues(plan.values);
      store.setRelations(plan.relations);

      // Write to atoms — single writer path for all 6
      setValues(plan.values);
      setRelations(plan.relations);
      setUnresolvedLinks(plan.unresolvedLinks);
      setResolvedRowsSnapshot(plan.resolvedRowsSnapshot);
      setResolvedTypesSnapshot(plan.resolvedTypesSnapshot);
      setResolvedEntitiesSnapshot(plan.resolvedEntitiesSnapshot);
    },
    [
      store,
      spaceId,
      setValues,
      setRelations,
      setUnresolvedLinks,
      setResolvedRowsSnapshot,
      setResolvedTypesSnapshot,
      setResolvedEntitiesSnapshot,
    ]
  );

  // ── Loading + pending rebuild refs ────────────────────────────────────
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  const pendingRebuildRef = useRef(false);

  // Keep sessionId in a ref so generate/rebuild closures always read the latest
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // ── Full async generation ─────────────────────────────────────────────
  // Phase 1: Build initial plan with empty resolution (instant — shows review immediately)
  // Phase 2: Resolve in background (100 concurrent searches), rebuild as results arrive
  const generate = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const dataRows = ImportSessionStore.getRows(sid);
    if ((!selectedType && typesColumnIndex === undefined) || dataRows.length === 0 || nameColIdx === undefined) return;
    const generationId = generationTrackerRef.current.start();
    const isCurrent = () => generationTrackerRef.current.isCurrent(generationId);
    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      const t0 = performance.now();
      if (DEBUG_IMPORT) console.log(`[import:generate] START — ${dataRows.length} rows, ${Object.keys(columnMapping).length} columns`);

      clearGeneratedChanges();

      const propertyLookup = {
        schema,
        extraProperties,
        getProperty: (propertyId: string) => store.getProperty(propertyId),
      };
      setUnresolvedLinks({});

      await new Promise(resolve => setTimeout(resolve, 0));

      const t1 = performance.now();
      const relationProperties = collectRelationCells({ columnMapping, dataRows, propertyLookup });
      if (DEBUG_IMPORT) console.log(`[import:generate] collectRelationCells: ${(performance.now() - t1).toFixed(1)}ms — ${relationProperties.length} relation props, ${relationProperties.reduce((n, rp) => n + rp.uniqueCellValues.size, 0)} unique tokens`);

      // ── Phase 1: Show review immediately with everything unresolved ──
      // Skip full buildImportPlan — just compute unresolved links directly.
      // No values/relations to create yet (nothing is resolved).
      const emptyTypes = new Map<string, { id: string; name: string; isNew?: boolean }>();
      const emptyRows = new Map<number, { entityId: string; name: string }>();

      // Show the review page immediately with empty state.
      // Don't compute unresolved links yet — that triggers a heavy re-render
      // with 16K+ cells. We'll set them after resolution completes.
      const initialPlan: ImportPlan = {
        values: [],
        relations: [],
        unresolvedLinks: {},
        resolvedRowsSnapshot: emptyRows,
        resolvedTypesSnapshot: emptyTypes,
        resolvedEntitiesSnapshot: new Map(),
      };
      if (DEBUG_IMPORT) console.log(`[import:generate] initial plan applied (empty — resolution in background)`);

      applyPlan(initialPlan);
      setStep('step5');

      if (!isCurrent()) return;

      // ── Phase 2: Background resolution ──────────────────────────────
      // Relation entities
      const t2 = performance.now();
      const relationResolution = await resolveRelationEntities({
        relationProperties,
        guard: { isCurrent },
      });
      if (DEBUG_IMPORT) console.log(`[import:generate] resolveRelationEntities: ${(performance.now() - t2).toFixed(1)}ms — found=${[...relationResolution.resolvedEntities.values()].filter(e => e.status === 'found').length}, created=${[...relationResolution.resolvedEntities.values()].filter(e => e.status === 'created').length}, unresolved=${relationResolution.unresolvedCount}`);
      if (relationResolution.aborted) return;

      const mergedResolvedEntities = new Map(relationResolution.resolvedEntities);
      for (const [cacheKey, override] of Object.entries(relationOverrides)) {
        mergedResolvedEntities.set(cacheKey, override);
      }

      // Types
      const t3 = performance.now();
      const typeResolution = await resolveTypesForRows({
        dataRows,
        typesColumnIndex,
        guard: { isCurrent },
      });
      if (DEBUG_IMPORT) console.log(`[import:generate] resolveTypesForRows: ${(performance.now() - t3).toFixed(1)}ms — ${typeResolution.resolvedTypes.size} types resolved`);
      if (typeResolution.aborted) return;

      const mergedResolvedTypes = new Map(typeResolution.resolvedTypes);
      for (const [rawType, override] of Object.entries(typeOverrides)) {
        mergedResolvedTypes.set(rawType, override);
      }

      // Rows
      const t4 = performance.now();
      const rowResolution = await resolveRowsByNameAndType({
        dataRows,
        nameColIdx,
        selectedType,
        typesColumnIndex,
        resolvedTypes: mergedResolvedTypes,
        guard: { isCurrent },
      });
      if (DEBUG_IMPORT) console.log(`[import:generate] resolveRowsByNameAndType: ${(performance.now() - t4).toFixed(1)}ms — resolved=${rowResolution.resolvedRows.size}, unresolved=${rowResolution.unresolvedRowCount}`);
      if (rowResolution.aborted) return;

      const mergedResolvedRows = new Map(rowResolution.resolvedRows);
      for (const [rowIndexStr, override] of Object.entries(rowOverrides)) {
        mergedResolvedRows.set(Number(rowIndexStr), override);
      }

      // ── Rebuild with full resolution ────────────────────────────────
      // Yield to let the browser breathe before heavy sync work
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!isCurrent()) return;

      if (DEBUG_IMPORT) console.log(`[import:generate] building final plan...`);
      const t5 = performance.now();
      const finalPlan = buildImportPlan({
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
        checkboxOverrides,
      });
      if (DEBUG_IMPORT) console.log(`[import:generate] final plan: ${(performance.now() - t5).toFixed(1)}ms — ${finalPlan.values.length} values, ${finalPlan.relations.length} relations, ${Object.keys(finalPlan.unresolvedLinks).length} unresolved cells`);

      if (!isCurrent()) return;

      // ── Apply in chunks to avoid a single long frame ────────────────
      // Clear the initial plan's store entries first
      if (initialPlan.values.length > 0 || initialPlan.relations.length > 0) {
        store.clearLocalChangesByIds({
          spaceId,
          valueIds: initialPlan.values.map(v => v.id),
          relationIds: initialPlan.relations.map(r => r.id),
        });
      }

      await new Promise(resolve => setTimeout(resolve, 0));

      // Write values in chunks
      const VALUE_CHUNK = 2000;
      const t6 = performance.now();
      for (let vi = 0; vi < finalPlan.values.length; vi += VALUE_CHUNK) {
        const chunk = finalPlan.values.slice(vi, vi + VALUE_CHUNK);
        store.setValues(chunk);
        if (vi + VALUE_CHUNK < finalPlan.values.length) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      if (DEBUG_IMPORT) console.log(`[import:generate] store.setValues: ${(performance.now() - t6).toFixed(1)}ms (${finalPlan.values.length} values)`);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Write relations in chunks
      const t7 = performance.now();
      for (let ri = 0; ri < finalPlan.relations.length; ri += VALUE_CHUNK) {
        const chunk = finalPlan.relations.slice(ri, ri + VALUE_CHUNK);
        store.setRelations(chunk);
        if (ri + VALUE_CHUNK < finalPlan.relations.length) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      if (DEBUG_IMPORT) console.log(`[import:generate] store.setRelations: ${(performance.now() - t7).toFixed(1)}ms (${finalPlan.relations.length} relations)`);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Write to atoms (single batch — React batches these)
      setValues(finalPlan.values);
      setRelations(finalPlan.relations);
      setUnresolvedLinks(finalPlan.unresolvedLinks);
      setResolvedRowsSnapshot(finalPlan.resolvedRowsSnapshot);
      setResolvedTypesSnapshot(finalPlan.resolvedTypesSnapshot);
      setResolvedEntitiesSnapshot(finalPlan.resolvedEntitiesSnapshot);
      if (DEBUG_IMPORT) console.log(`[import:generate] atoms updated`);

      if (DEBUG_IMPORT) console.log(`[import:generate] DONE — total ${(performance.now() - t0).toFixed(1)}ms`);

      if (rowResolution.unresolvedRowCount > 0 || relationResolution.unresolvedCount > 0) {
        if (DEBUG_IMPORT) console.warn(
          `[import] unresolved links: rows=${rowResolution.unresolvedRowCount}, relationCells=${relationResolution.unresolvedCount}`
        );
      }
    } finally {
      if (generationTrackerRef.current.isCurrent(generationId)) {
        setIsLoading(false);
      }
    }
  }, [
    checkboxOverrides,
    columnMapping,
    clearGeneratedChanges,
    extraProperties,
    nameColIdx,
    rowCount, // triggers re-create when data changes
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
    setResolvedTypesSnapshot,
    setResolvedEntitiesSnapshot,
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
    checkboxOverrides,
    relationOverrides,
    typeOverrides,
    rowOverrides,
    resolvedEntitiesSnapshot,
    resolvedTypesSnapshot,
    resolvedRowsSnapshot,
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
    checkboxOverrides,
    relationOverrides,
    typeOverrides,
    rowOverrides,
    resolvedEntitiesSnapshot,
    resolvedTypesSnapshot,
    resolvedRowsSnapshot,
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
   * not trigger cascading re-renders. Data rows are read fresh from the
   * session store at rebuild time.
   */
  const rebuild = useCallback(async () => {
    // If generate is in flight, defer this rebuild until it completes
    if (isLoadingRef.current) {
      pendingRebuildRef.current = true;
      return;
    }

    const sid = sessionIdRef.current;
    if (!sid) return;
    const dataRows = ImportSessionStore.getRows(sid);

    const ctx = rebuildContextRef.current;
    if (dataRows.length === 0 || ctx.nameColIdx === undefined) return;

    const propertyLookup = {
      schema: ctx.schema,
      extraProperties: ctx.extraProperties,
      getProperty: (propertyId: string) => store.getProperty(propertyId),
    };

    const mergedEntities = new Map<string, ResolvedEntity>(ctx.resolvedEntitiesSnapshot as Map<string, ResolvedEntity>);
    for (const [key, override] of Object.entries(ctx.relationOverrides)) {
      mergedEntities.set(key, override);
    }

    const mergedTypes = new Map(ctx.resolvedTypesSnapshot);
    for (const [rawType, override] of Object.entries(ctx.typeOverrides)) {
      mergedTypes.set(rawType, override);
    }

    const mergedRows = new Map(ctx.resolvedRowsSnapshot);
    for (const [rowIdxStr, override] of Object.entries(ctx.rowOverrides)) {
      mergedRows.set(Number(rowIdxStr), override);
    }

    // Clear the previous import's local changes from the store BEFORE building
    // the plan so hasExistingRelation only sees truly pre-existing relations.
    if (ctx.values.length > 0 || ctx.relations.length > 0) {
      store.clearLocalChangesByIds({
        spaceId,
        valueIds: ctx.values.map(v => v.id),
        relationIds: ctx.relations.map(r => r.id),
      });
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
      checkboxOverrides: ctx.checkboxOverrides,
    });

    // Chunked store writes to avoid a single long frame
    const VALUE_CHUNK = 2000;
    for (let vi = 0; vi < plan.values.length; vi += VALUE_CHUNK) {
      store.setValues(plan.values.slice(vi, vi + VALUE_CHUNK));
      if (vi + VALUE_CHUNK < plan.values.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    for (let ri = 0; ri < plan.relations.length; ri += VALUE_CHUNK) {
      store.setRelations(plan.relations.slice(ri, ri + VALUE_CHUNK));
      if (ri + VALUE_CHUNK < plan.relations.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    setValues(plan.values);
    setRelations(plan.relations);
    setUnresolvedLinks(plan.unresolvedLinks);
    setResolvedRowsSnapshot(plan.resolvedRowsSnapshot);
    setResolvedTypesSnapshot(plan.resolvedTypesSnapshot);
    setResolvedEntitiesSnapshot(plan.resolvedEntitiesSnapshot);
  }, [store, spaceId, setValues, setRelations, setUnresolvedLinks, setResolvedRowsSnapshot, setResolvedTypesSnapshot, setResolvedEntitiesSnapshot]);

  // Drain pending rebuild when isLoading transitions to false.
  // Using an effect guarantees React has committed the state change,
  // avoiding the race where a microtask runs before the ref updates.
  useEffect(() => {
    if (!isLoading && pendingRebuildRef.current) {
      pendingRebuildRef.current = false;
      rebuild();
    }
  }, [isLoading, rebuild]);

  // Track whether initial generation has completed so we know when overrides
  // should trigger incremental rebuilds. Flips when isLoading transitions false
  // (not when snapshots are non-empty — an all-unresolved import can legitimately
  // finish with all three snapshot maps empty).
  const hasGeneratedRef = useRef(false);

  useEffect(() => {
    if (!isLoading && hasGeneratedRef.current === false && rowCount > 0) {
      // isLoading just went false and we have data — generation is done
      hasGeneratedRef.current = true;
    }
  }, [isLoading, rowCount]);

  // When overrides change after initial generation, do an incremental rebuild
  // instead of a full re-resolve.
  useEffect(() => {
    if (!hasGeneratedRef.current) return;
    rebuild();
  }, [checkboxOverrides, relationOverrides, typeOverrides, rowOverrides, rebuild]);

  return { generate, rebuild, isLoading, canGenerate };
}
