import Dexie, { Table } from 'dexie';

import type { StoredImportSession } from '../chat/import/session';
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
  importSessions!: Table<StoredImportSession, string>;

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

    // An attached spreadsheet outlives a page reload. Refreshing mid-import
    // used to lose the parsed file, and the only way forward was to attach it
    // again — worse when the thing that prompted the refresh was an error
    // message telling the user to reload. `createdAt` is indexed so stale
    // sessions can be swept without reading every row; `fingerprint`
    // identifies the file rather than the upload, so re-attaching a
    // spreadsheet whose edits are still sitting unpublished can be recognised
    // instead of staging everything a second time.
    this.version(4).stores({
      values: 'id, spaceId',
      relations: 'id, spaceId',
      debateRecordingUploads: 'id, userId, debateId, stage, nextAttemptAt, createdAt',
      debateRecordingStreams: 'id, userId, debateId',
      debateRecordingChunks: '[streamId+seq], streamId',
      importSessions: 'id, spaceId, createdAt, fingerprint',
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
