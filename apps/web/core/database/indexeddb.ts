import Dexie, { Table } from 'dexie';

import { StoredRelation, StoredTriple } from './types';

const DB_NAME = 'geogenesis';
const VERSION = 2;

export class Geo extends Dexie {
  triples!: Table<StoredTriple>;
  relations!: Table<StoredRelation>;

  constructor() {
    super(DB_NAME);

    this.version(VERSION).stores({
      triples: '++id',
      relations: '++id',
    });
  }
}

export const db = new Geo();
