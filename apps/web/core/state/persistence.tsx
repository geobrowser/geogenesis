'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';

import { useLocalStorage } from '~/core/hooks/use-local-storage';

import { useActionsStore } from '../hooks/use-actions-store';
import { Action } from '../utils/action';
import { actionsAtom } from './actions-store/actions-store';
import { db } from './actions-store/indexeddb';
import { store } from './jotai-provider';

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
    // note: finely tuned dependency because `storedActions` is only used on initial render
    // `storedActions` will only change once as a result of clearing them in this effect
  }, [isInitialRender]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setIsInitialRender(false);
  }, []);

  React.useEffect(() => {
    const unsub = store.sub(actionsAtom, async () => {
      const newActions = store.get(actionsAtom);

      // Dexie docs recommend putting all batched operations in a transaction scope
      // https://dexie.org/docs/Tutorial/Best-Practices#5-use-transaction-scopes-whenever-you-plan-to-make-more-than-one-operation
      db.transaction('rw', db.actions, () => {
        db.actions.clear();
        return db.actions.bulkPut(Action.prepareActionsForPublishing(newActions));
      });
    });

    return () => {
      unsub();
    };
  }, []);

  return <React.Fragment />;
};
