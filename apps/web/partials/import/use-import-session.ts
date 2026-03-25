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
  }, [
    relations,
    setRelations,
    setUnresolvedLinks,
    setResolvedRowsSnapshot,
    setResolvedEntitiesSnapshot,
    setResolvedTypesSnapshot,
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

  return {
    clearGeneratedChanges,
    resetMappedState,
    resetImportState,
  };
}
