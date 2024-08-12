'use client';

import * as React from 'react';

import { db } from '../database/indexeddb';
import { localOpsAtom } from '../database/write';
import { store } from './jotai-store';

export const Persistence = () => {
  React.useEffect(() => {
    // Subscribe to the actions store and write all actions to indexeddb when
    // they are changed.
    //
    // We only store unpublished, squashed actions in indexeddb to avoid the
    // database growing indefinitely.
    const unsub = store.sub(localOpsAtom, async () => {
      const newTriples = store.get(localOpsAtom);

      // Dexie docs recommend putting all batched operations in a transaction scope
      // https://dexie.org/docs/Tutorial/Best-Practices#5-use-transaction-scopes-whenever-you-plan-to-make-more-than-one-operation
      db.transaction('rw', db.triples, () => {
        db.triples.clear();
        // Dexie docs recommend returning the last promise used in a transaction.
        // We don't need to await the promises in a transaction, either.
        return db.triples.bulkPut(newTriples);
      });
    });

    return () => {
      unsub();
    };
  }, []);

  return <React.Fragment />;
};
