import Dexie, { Table } from 'dexie';

import { Action } from '~/core/types';

const DB_NAME = 'geogenesis';
const TABLE_NAME = 'actionsStore';
const VERSION = 1;

export class Geo extends Dexie {
  actions!: Table<Action>;

  constructor() {
    super(DB_NAME);

    this.version(VERSION).stores({
      actions: '++id', // Primary key and indexed props
    });
  }
}

export const db = new Geo();
