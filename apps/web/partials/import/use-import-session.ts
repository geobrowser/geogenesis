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

function countRemovedColumnsBefore(col: number, removed: Set<number>): number {
  let n = 0;
  removed.forEach(r => {
    if (r < col) n++;
  });
  return n;
}

function remapColumnMappingAfterRemove(
  prev: Record<number, string>,
  removed: Set<number>
): Record<number, string> {
  const next: Record<number, string> = {};
  for (const [k, v] of Object.entries(prev)) {
    const j = Number(k);
    if (removed.has(j)) continue;
    next[j - countRemovedColumnsBefore(j, removed)] = v;
  }
  return next;
}

function remapTypesColumnIndexAfterRemove(
  prev: number | undefined,
  removed: Set<number>
): number | undefined {
  if (prev === undefined) return undefined;
  if (removed.has(prev)) return undefined;
  return prev - countRemovedColumnsBefore(prev, removed);
}

function remapRowColKeyedRecord<T>(prev: Record<string, T>, removed: Set<number>): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [key, val] of Object.entries(prev)) {
    const sep = key.indexOf(':');
    if (sep === -1) continue;
    const row = key.slice(0, sep);
    const col = Number(key.slice(sep + 1));
    if (Number.isNaN(col)) continue;
    if (removed.has(col)) continue;
    const newCol = col - countRemovedColumnsBefore(col, removed);
    next[`${row}:${newCol}`] = val;
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
      setUnresolvedLinks(prev => remapRowColKeyedRecord(prev, removed));
      setCheckboxOverrides(prev => remapRowColKeyedRecord(prev, removed));
      clearGeneratedChanges();
    },
    [
      currentSessionId,
      setHeaders,
      setRowCount,
      setImportRevision,
      setColumnMapping,
      setTypesColumnIndex,
      setUnresolvedLinks,
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
