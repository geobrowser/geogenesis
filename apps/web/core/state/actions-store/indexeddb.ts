import Dexie, { Table } from 'dexie';

import { Action, SpaceActions } from '~/core/types';

const LEGACY_DB_NAME = 'Legend';
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

export class LegacyGeo extends Dexie {
  actionsStore!: Table<SpaceActions>;

  constructor() {
    super(LEGACY_DB_NAME);

    this.version(VERSION).stores({
      actionsStore: 'id',
    });
  }
}

export const db = new Geo();
export const legacyDb = new LegacyGeo();
