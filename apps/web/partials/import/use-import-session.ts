'use client';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { useSyncEngine } from '~/core/sync/use-sync-engine';

import {
  columnMappingAtom,
  extraPropertiesAtom,
  fileNameAtom,
  recordsAtom,
  relationsAtom,
  selectedTypeAtom,
  stepAtom,
  typesColumnIndexAtom,
  valuesAtom,
} from './atoms';
import type { ImportStep } from './atoms';

export function useImportSession(spaceId: string) {
  const { store } = useSyncEngine();
  const values = useAtomValue(valuesAtom);
  const relations = useAtomValue(relationsAtom);
  const setValues = useSetAtom(valuesAtom);
  const setRelations = useSetAtom(relationsAtom);
  const setSelectedType = useSetAtom(selectedTypeAtom);
  const setTypesColumnIndex = useSetAtom(typesColumnIndexAtom);
  const setColumnMapping = useSetAtom(columnMappingAtom);
  const setExtraProperties = useSetAtom(extraPropertiesAtom);
  const setFileName = useSetAtom(fileNameAtom);
  const setRecords = useSetAtom(recordsAtom);
  const [, setStep] = useAtom(stepAtom);

  const clearGeneratedChanges = useCallback(() => {
    store.clearLocalChangesByIds({
      spaceId,
      valueIds: values.map(v => v.id),
      relationIds: relations.map(r => r.id),
    });
    setValues([]);
    setRelations([]);
  }, [relations, setRelations, setValues, spaceId, store, values]);

  const resetMappedState = useCallback(() => {
    clearGeneratedChanges();
    setSelectedType(null);
    setTypesColumnIndex(undefined);
    setColumnMapping({});
    setExtraProperties({});
  }, [
    clearGeneratedChanges,
    setColumnMapping,
    setExtraProperties,
    setSelectedType,
    setTypesColumnIndex,
  ]);

  const resetImportState = useCallback(
    (options?: { clearFile?: boolean; step?: ImportStep }) => {
      resetMappedState();

      if (options?.clearFile) {
        setFileName(undefined);
        setRecords([]);
      }

      if (options?.step) {
        setStep(options.step);
      }
    },
    [resetMappedState, setFileName, setRecords, setStep]
  );

  return {
    clearGeneratedChanges,
    resetMappedState,
    resetImportState,
  };
}
