'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';

import { useLocalStorage } from '~/core/hooks/use-local-storage';

import { useActionsStore } from '../hooks/use-actions-store';

export const Persistence = () => {
  const [isInitialRender, setIsInitialRender] = useState<boolean>(true);
  const { restore } = useActionsStore();
  const [storedActions, setStoredActions] = useLocalStorage('storedActions', {});

  // Move actions from localStorage to IndexedDB
  useEffect(() => {
    if (isInitialRender) {
      if (Object.keys(storedActions).length > 0) {
        restore(storedActions);
        setStoredActions({});
      }
    }
  }, [isInitialRender]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setIsInitialRender(false);
  }, []);

  return <React.Fragment />;
};
