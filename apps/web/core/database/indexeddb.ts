import Dexie, { Table } from 'dexie';

import type { DebateRecordingChunk, DebateRecordingStream } from '../debates/recording-stream';
import type { DebateRecordingUpload } from '../debates/recording-upload-queue';
import { Relation, Value } from '../types';

const OLD_DB_NAME = 'geogenesis';
const DB_NAME = 'geogenesis-local';

class Geo extends Dexie {
  values!: Table<Value>;
  relations!: Table<Relation>;
  debateRecordingUploads!: Table<DebateRecordingUpload, string>;
  /** A recording still being made, one row per recorder run (GEO-2955). */
  debateRecordingStreams!: Table<DebateRecordingStream, string>;
  /** Its `MediaRecorder` timeslices, written as they arrive so a crash loses at most one. */
  debateRecordingChunks!: Table<DebateRecordingChunk, [string, number]>;

  constructor() {
    super(DB_NAME);

    this.version(1).stores({
      values: 'id, spaceId',
      relations: 'id, spaceId',
    });

    this.version(2).stores({
      values: 'id, spaceId',
      relations: 'id, spaceId',
      debateRecordingUploads: 'id, userId, debateId, stage, nextAttemptAt, createdAt',
    });

    this.version(3).stores({
      values: 'id, spaceId',
      relations: 'id, spaceId',
      debateRecordingUploads: 'id, userId, debateId, stage, nextAttemptAt, createdAt',
      debateRecordingStreams: 'id, userId, debateId',
      debateRecordingChunks: '[streamId+seq], streamId',
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
