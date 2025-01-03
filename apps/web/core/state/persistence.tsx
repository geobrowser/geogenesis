'use client';

import * as React from 'react';

import { db } from '../database/indexeddb';
import { localOpsAtom, localRelationsAtom } from '../database/write';
import { store } from './jotai-store';

export const Persistence = () => {
  React.useEffect(() => {
    const unsubTriples = store.sub(localOpsAtom, async () => {
      const newTriples = store.get(localOpsAtom);

      // Dexie docs recommend putting all batched operations in a transaction scope
      // https://dexie.org/docs/Tutorial/Best-Practices#5-use-transaction-scopes-whenever-you-plan-to-make-more-than-one-operation
      db.transaction('rw', db.triples, () => {
        db.triples.clear();
        // Dexie docs recommend returning the last promise used in a transaction.
        // We don't need to await the promises in a transaction, either.
        return db.triples.bulkPut(newTriples.filter(t => !t.hasBeenPublished));
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
      unsubTriples();
      unsubRelations();
    };
  }, []);

  return null;
};
