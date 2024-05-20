import Dexie, { Table } from 'dexie';

import { AppTriple } from '~/core/types';

const DB_NAME = 'geogenesis';
const TABLE_NAME = 'actionsStore';
const VERSION = 1;

export class Geo extends Dexie {
  actions!: Table<AppTriple>;

  constructor() {
    super(DB_NAME);

    this.version(VERSION).stores({
      triples: '++id', // Primary key and indexed props
    });
  }
}

export const db = new Geo();
