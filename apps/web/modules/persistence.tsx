import * as React from 'react';
import { useState, useEffect } from 'react';

import { Action, useActionsStore } from './action';
import { useLocalStorage } from './hooks/use-local-storage';
import type { SpaceActions } from './action/actions-store';

const ACTIONS_STORE_KEY = 'storedActions';

export const Persistence = () => {
  const [isInitialRender, setIsInitialRender] = useState<boolean>(true);
  const { actions, restore } = useActionsStore();
  const [storedActions, setStoredActions] = useLocalStorage(ACTIONS_STORE_KEY, {}, restore);

  // Restore actions on first render, save actions each render thereafter
  useEffect(() => {
    if (isInitialRender) {
      console.info('🔃 restoring actions');
      restore(storedActions);
    } else {
      console.info('💾 saving actions');

      // We don't want to store actions that have been published, otherwise the local storage
      // will grow infinitely. Additionally, we don't want to store the intermediate steps
      // taken on triples. We only care about the first state and the last state.
      const unpublishedActions = Object.entries(actions).reduce((acc, [spaceId, spaceActions]) => {
        acc[spaceId] = Action.prepareActionsForPublishing(spaceActions);
        return acc;
      }, {} as SpaceActions);

      setStoredActions(unpublishedActions);
    }
    // note: finely tuned dependency because `storedActions` is only used on initial render
    // no need to save stored actions a second time when `storedActions` are updated
  }, [isInitialRender, actions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setIsInitialRender(false);
  }, []);

  return <React.Fragment />;
};
