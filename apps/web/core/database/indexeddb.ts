import Dexie, { Table } from 'dexie';

import type { DebateRecordingUpload } from '../debates/recording-upload-queue';
import { Relation, Value } from '../types';

const OLD_DB_NAME = 'geogenesis';
const DB_NAME = 'geogenesis-local';
const VERSION = 2;

class Geo extends Dexie {
  values!: Table<Value>;
  relations!: Table<Relation>;
  debateRecordingUploads!: Table<DebateRecordingUpload, string>;

  constructor() {
    super(DB_NAME);

    this.version(1).stores({
      values: 'id, spaceId',
      relations: 'id, spaceId',
    });

    this.version(VERSION).stores({
      values: 'id, spaceId',
      relations: 'id, spaceId',
      debateRecordingUploads: 'id, userId, debateId, stage, nextAttemptAt, createdAt',
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
