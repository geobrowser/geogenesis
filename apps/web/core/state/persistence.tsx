'use client';

import * as React from 'react';

import { db } from '../database/indexeddb';
import { localRelationsAtom, localValuesAtom } from '../database/write';
import { store } from './jotai-store';

export const Persistence = () => {
  React.useEffect(() => {
    const unsubValues = store.sub(localValuesAtom, async () => {
      const newValues = store.get(localValuesAtom);

      // Dexie docs recommend putting all batched operations in a transaction scope
      // https://dexie.org/docs/Tutorial/Best-Practices#5-use-transaction-scopes-whenever-you-plan-to-make-more-than-one-operation
      db.transaction('rw', db.values, () => {
        db.values.clear();
        // Dexie docs recommend returning the last promise used in a transaction.
        // We don't need to await the promises in a transaction, either.
        return db.values.bulkPut(newValues.filter(t => !t.hasBeenPublished));
      });
    });

    const unsubRelations = store.sub(localRelationsAtom, async () => {
      const newRelations = store.get(localRelationsAtom);

      // Dexie docs recommend putting all batched operations in a transaction scope
      // https://dexie.org/docs/Tutorial/Best-Practices#5-use-transaction-scopes-whenever-you-plan-to-make-more-than-one-operation
      db.transaction('rw', db.relations, () => {
        db.relations.clear();
        // Dexie docs recommend returning the last promise used in a transaction.
        // We don't need to await the promises in a transaction, either.
        return db.relations.bulkPut(newRelations.filter(r => !r.hasBeenPublished));
      });
    });

    return () => {
      unsubValues();
      unsubRelations();
    };
  }, []);

  return null;
};
