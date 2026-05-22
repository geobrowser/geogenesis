'use client';

import * as React from 'react';

import { atom, useSetAtom } from 'jotai';

import { useDataBlockInstance } from './use-data-block';

export const activeDataBlockIdAtom = atom<string | null>(null);

export function useDataBlockInteraction(active: boolean) {
  const { entityId } = useDataBlockInstance();
  const setActiveDataBlockId = useSetAtom(activeDataBlockIdAtom);

  React.useEffect(() => {
    if (!active) return;
    setActiveDataBlockId(entityId);
  }, [active, entityId, setActiveDataBlockId]);
}

export function useActivateDataBlock() {
  const { entityId } = useDataBlockInstance();
  const setActiveDataBlockId = useSetAtom(activeDataBlockIdAtom);

  return React.useCallback(() => {
    setActiveDataBlockId(entityId);
  }, [entityId, setActiveDataBlockId]);
}
