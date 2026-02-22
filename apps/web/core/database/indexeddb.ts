import Dexie, { Table } from 'dexie';

import { Relation, Value } from '../types';

const OLD_DB_NAME = 'geogenesis';
const DB_NAME = 'geogenesis-local';
const VERSION = 1;

class Geo extends Dexie {
  values!: Table<Value>;
  relations!: Table<Relation>;

  constructor() {
    super(DB_NAME);

    this.version(VERSION).stores({
      values: 'id, spaceId',
      relations: 'id, spaceId',
    });
  }
}

export const db = new Geo();

// Best-effort cleanup of legacy DB that used an incompatible PK.
if (typeof indexedDB !== 'undefined') {
  try {
    indexedDB.deleteDatabase(OLD_DB_NAME);
  } catch {
    // Ignore cleanup errors; new DB should still work.
  }
}
