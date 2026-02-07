import Dexie, { Table } from 'dexie';

import { Relation, Value } from '../types';

const DB_NAME = 'geogenesis';
const VERSION = 3;

class Geo extends Dexie {
  values!: Table<Value>;
  relations!: Table<Relation>;

  constructor() {
    super(DB_NAME);

    // Keep v2 declaration so Dexie knows the upgrade path
    this.version(2).stores({
      values: '++id',
      relations: '++id',
    });

    // v3: string PK + spaceId index for efficient space-scoped deletes
    this.version(VERSION)
      .stores({
        values: 'id, spaceId',
        relations: 'id, spaceId',
      })
      .upgrade(tx => {
        // Clear stale v2 data since the PK type changed
        tx.table('values').clear();
        tx.table('relations').clear();
      });
  }
}

export const db = new Geo();
