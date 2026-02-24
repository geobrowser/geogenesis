'use client';

import { useSetAtom } from 'jotai';

import * as React from 'react';

import { editorContentVersionAtom } from '~/atoms';
import { persistenceEngine } from '~/core/sync/use-sync-engine';

export const Persistence = () => {
  const bumpEditorContentVersion = useSetAtom(editorContentVersionAtom);

  React.useEffect(() => {
    persistenceEngine.restore().then(restored => {
      if (restored) bumpEditorContentVersion(v => v + 1);
    });
  }, [bumpEditorContentVersion]);

  return null;
};
