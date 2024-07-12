import Dexie, { Table } from 'dexie';

import { StoredTriple } from './types';

const DB_NAME = 'geogenesis';
const VERSION = 1;

export class Geo extends Dexie {
  triples!: Table<StoredTriple>;

  constructor() {
    super(DB_NAME);

    this.version(VERSION).stores({
      triples: '++id', // Primary key and indexed props
    });
  }
}

export const db = new Geo();
