'use client';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { useSyncEngine } from '~/core/sync/use-sync-engine';

import {
  checkboxOverridesAtom,
  columnMappingAtom,
  extraPropertiesAtom,
  fileNameAtom,
  headersAtom,
  imageEntityCacheAtom,
  imageTasksAtom,
  importRevisionAtom,
  importSessionIdAtom,
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
import type { ImportStep } from './atoms';
import { ImportSessionStore } from './import-session-store';

/**
 * Returns a function that maps an old column index to the number of removed columns
 * strictly before it, using binary search over a sorted copy of `removed`. This keeps
 * each remap O(entries × log removedCols) instead of O(entries × removedCols), which
 * matters on large `unresolvedLinks` / `checkboxOverrides` records.
 */
function makeColumnShifter(removed: Set<number>): (col: number) => number {
  const sorted = [...removed].sort((a, b) => a - b);
  return (col: number): number => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] < col) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}

function remapColumnMappingAfterRemove(
  prev: Record<number, string>,
  removed: Set<number>
): Record<number, string> {
  const shiftBefore = makeColumnShifter(removed);
  const next: Record<number, string> = {};
  for (const [k, v] of Object.entries(prev)) {
    const j = Number(k);
    if (removed.has(j)) continue;
    next[j - shiftBefore(j)] = v;
  }
  return next;
}

function remapTypesColumnIndexAfterRemove(
  prev: number | undefined,
  removed: Set<number>
): number | undefined {
  if (prev === undefined) return undefined;
  if (removed.has(prev)) return undefined;
  return prev - makeColumnShifter(removed)(prev);
}

function remapRowColKeyedRecord<T>(prev: Record<string, T>, removed: Set<number>): Record<string, T> {
  const shiftBefore = makeColumnShifter(removed);
  const next: Record<string, T> = {};
  for (const [key, val] of Object.entries(prev)) {
    const sep = key.indexOf(':');
    if (sep === -1) continue;
    const row = key.slice(0, sep);
    const col = Number(key.slice(sep + 1));
    if (Number.isNaN(col)) continue;
    if (removed.has(col)) continue;
    next[`${row}:${col - shiftBefore(col)}`] = val;
  }
  return next;
}

export function useImportSession(spaceId: string) {
  const { store } = useSyncEngine();
  const values = useAtomValue(valuesAtom);
  const relations = useAtomValue(relationsAtom);
  const setValues = useSetAtom(valuesAtom);
  const setRelations = useSetAtom(relationsAtom);
  const setCheckboxOverrides = useSetAtom(checkboxOverridesAtom);
  const setRelationOverrides = useSetAtom(relationOverridesAtom);
  const setRowOverrides = useSetAtom(rowOverridesAtom);
  const setTypeOverrides = useSetAtom(typeOverridesAtom);
  const setUnresolvedLinks = useSetAtom(unresolvedLinksAtom);
  const setResolvedRowsSnapshot = useSetAtom(resolvedRowsSnapshotAtom);
  const setResolvedEntitiesSnapshot = useSetAtom(resolvedEntitiesSnapshotAtom);
  const setResolvedTypesSnapshot = useSetAtom(resolvedTypesSnapshotAtom);
  const setSelectedType = useSetAtom(selectedTypeAtom);
  const setTypesColumnIndex = useSetAtom(typesColumnIndexAtom);
  const setColumnMapping = useSetAtom(columnMappingAtom);
  const setExtraProperties = useSetAtom(extraPropertiesAtom);
  const setImageTasks = useSetAtom(imageTasksAtom);
  const setImageEntityCache = useSetAtom(imageEntityCacheAtom);
  const setFileName = useSetAtom(fileNameAtom);
  const setHeaders = useSetAtom(headersAtom);
  const setRowCount = useSetAtom(rowCountAtom);
  const setImportSessionId = useSetAtom(importSessionIdAtom);
  const setImportRevision = useSetAtom(importRevisionAtom);
  const currentSessionId = useAtomValue(importSessionIdAtom);
  const [, setStep] = useAtom(stepAtom);

  const clearGeneratedChanges = useCallback(() => {
    store.clearLocalChangesByIds({
      spaceId,
      valueIds: values.map(v => v.id),
      relationIds: relations.map(r => r.id),
    });
    setValues([]);
    setRelations([]);
    setUnresolvedLinks({});
    setResolvedRowsSnapshot(new Map());
    setResolvedEntitiesSnapshot(new Map());
    setResolvedTypesSnapshot(new Map());
    setImageTasks([]);
    setImageEntityCache({});
  }, [
    relations,
    setRelations,
    setUnresolvedLinks,
    setResolvedRowsSnapshot,
    setResolvedEntitiesSnapshot,
    setResolvedTypesSnapshot,
    setImageTasks,
    setImageEntityCache,
    setValues,
    spaceId,
    store,
    values,
  ]);

  const resetMappedState = useCallback(() => {
    clearGeneratedChanges();
    setCheckboxOverrides({});
    setRelationOverrides({});
    setRowOverrides({});
    setTypeOverrides({});
    setSelectedType(null);
    setTypesColumnIndex(undefined);
    setColumnMapping({});
    setExtraProperties({});
  }, [
    clearGeneratedChanges,
    setCheckboxOverrides,
    setColumnMapping,
    setExtraProperties,
    setRelationOverrides,
    setRowOverrides,
    setTypeOverrides,
    setSelectedType,
    setTypesColumnIndex,
  ]);

  const resetImportState = useCallback(
    (options?: { clearFile?: boolean; step?: ImportStep }) => {
      resetMappedState();

      if (options?.clearFile) {
        setFileName(undefined);
        if (currentSessionId) ImportSessionStore.clear(currentSessionId);
        setHeaders([]);
        setRowCount(0);
        setImportSessionId(null);
        setImportRevision(r => r + 1);
      }

      if (options?.step) {
        setStep(options.step);
      }
    },
    [resetMappedState, setFileName, setStep, currentSessionId, setHeaders, setRowCount, setImportSessionId, setImportRevision]
  );

  const deleteImportColumns = useCallback(
    (columnIndices: number[]) => {
      if (!currentSessionId || columnIndices.length === 0) return;
      const { headers } = ImportSessionStore.get(currentSessionId);
      const removed = new Set(
        [...new Set(columnIndices)].filter(i => Number.isInteger(i) && i >= 0 && i < headers.length)
      );
      if (removed.size === 0) return;
      if (!ImportSessionStore.removeColumns(currentSessionId, [...removed])) return;
      const data = ImportSessionStore.get(currentSessionId);
      setHeaders([...data.headers]);
      setRowCount(data.rowCount);
      setImportRevision(r => r + 1);
      setColumnMapping(prev => remapColumnMappingAfterRemove(prev, removed));
      setTypesColumnIndex(prev => remapTypesColumnIndexAfterRemove(prev, removed));
      setCheckboxOverrides(prev => remapRowColKeyedRecord(prev, removed));
      // `unresolvedLinks` is reset inside `clearGeneratedChanges` below, so remapping
      // it here would be wasted work (the clear overwrites it with `{}`).
      clearGeneratedChanges();
    },
    [
      currentSessionId,
      setHeaders,
      setRowCount,
      setImportRevision,
      setColumnMapping,
      setTypesColumnIndex,
      setCheckboxOverrides,
      clearGeneratedChanges,
    ]
  );

  return {
    clearGeneratedChanges,
    deleteImportColumns,
    resetMappedState,
    resetImportState,
  };
}
