import * as React from 'react';
import { useState, useEffect } from 'react';

import { useActionsStore } from './action';
import { useLocalStorage } from './hooks/use-local-storage';
import type { SpaceActions } from './action/actions-store';

export const Persistence = () => {
  const [isInitialRender, setIsInitialRender] = useState<boolean>(true);
  const { actions, restore } = useActionsStore();

  const unpublishedActions: SpaceActions = {};
  Object.keys(actions).forEach(key => {
    unpublishedActions[key] = actions[key].filter(a => !a.hasBeenPublished);
  });

  const [storedActions, setStoredActions] = useLocalStorage('storedActions', {});

  // Restore actions on first render, save actions each render thereafter
  useEffect(() => {
    if (isInitialRender) {
      console.info('🔃 restoring actions');
      restore(storedActions);
    } else {
      console.info('💾 saving actions');
      setStoredActions(unpublishedActions);
    }
    // note: finely tuned dependency because `storedActions` is only used on initial render
    // no need to save stored actions a second time when storedactions are updated
  }, [isInitialRender, actions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setIsInitialRender(false);
  }, []);

  return <React.Fragment />;
};
