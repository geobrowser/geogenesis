'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';

import { useLocalStorage } from '~/core/hooks/use-local-storage';

import { useActionsStore } from '../hooks/use-actions-store';
import { Action } from '../utils/action';
import type { SpaceActions } from './actions-store';

export const Persistence = () => {
  const [isInitialRender, setIsInitialRender] = useState<boolean>(true);
  const { actions, restore } = useActionsStore();
  const [storedActions, setStoredActions] = useLocalStorage('storedActions', {});

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
        const squashedActionsForSpace = Action.prepareActionsForPublishing(spaceActions);

        // Only add spaces that have unpublished changes
        if (squashedActionsForSpace.length > 0) {
          acc[spaceId] = squashedActionsForSpace;
        }

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
