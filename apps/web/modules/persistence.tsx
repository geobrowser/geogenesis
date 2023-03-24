import * as React from 'react';
import { useState, useEffect } from 'react';

import { useActionsStore } from './action';
import { useLocalStorage } from './hooks/use-local-storage';

export const Persistence = () => {
  const [isInitialRender, setIsInitialRender] = useState(true);
  const { rawActions, restore } = useActionsStore();
  const [storedActions, setStoredActions] = useLocalStorage('storedActions', {});

  // Restore actions on first render, save actions each render thereafter
  // note: finely tuned dependency array is used to prevent infinite rerenders
  useEffect(() => {
    if (isInitialRender) {
      console.info('🔃 restoring actions');
      restore(storedActions);
    } else {
      console.info('💾 saving actions');
      setStoredActions(rawActions);
    }
  }, [isInitialRender, rawActions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setIsInitialRender(false);
  }, []);

  return <React.Fragment />;
};
