import Dexie, { Table } from 'dexie';

import { Relation, Value } from '../v2.types';

const DB_NAME = 'geogenesis';
const VERSION = 2;

class Geo extends Dexie {
  values!: Table<Value>;
  relations!: Table<Relation>;

  constructor() {
    super(DB_NAME);

    this.version(VERSION).stores({
      values: '++id',
      relations: '++id',
    });
  }
}

export const db = new Geo();
