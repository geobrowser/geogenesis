'use client';

import * as React from 'react';

import { Action } from '../utils/action';
import { actionsAtom } from './actions-store/actions-store';
import { db } from './actions-store/indexeddb';
import { store } from './jotai-provider';

export const Persistence = () => {
  React.useEffect(() => {
    // Subscribe to the actions store and write all actions to indexeddb when
    // they are changed.
    //
    // We only store unpublished, squashed actions in indexeddb to avoid the
    // database growing indefinitely.
    const unsub = store.sub(actionsAtom, async () => {
      const newActions = store.get(actionsAtom);

      // Dexie docs recommend putting all batched operations in a transaction scope
      // https://dexie.org/docs/Tutorial/Best-Practices#5-use-transaction-scopes-whenever-you-plan-to-make-more-than-one-operation
      db.transaction('rw', db.actions, () => {
        db.actions.clear();
        // Dexie docs recommend returning the last promise used in a transaction.
        // We don't need to await the promises in a transaction, either.
        return db.actions.bulkPut(Action.prepareActionsForPublishing(newActions));
      });
    });

    return () => {
      unsub();
    };
  }, []);

  return <React.Fragment />;
};
