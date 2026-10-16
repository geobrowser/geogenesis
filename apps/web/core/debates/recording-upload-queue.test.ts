import { IDBKeyRange, IDBObjectStore, indexedDB } from 'fake-indexeddb';
import { Blob as NodeBlob } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { db as database } from '~/core/database/indexeddb';

import type * as RecordingUploadQueue from './recording-upload-queue';

const analytics = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('~/core/analytics', () => analytics);

let db: typeof database;
let queue: typeof RecordingUploadQueue;

const MiB = 1024 * 1024;

/**
 * Makes the fake IndexedDB fail the way Safari did on 1 Oct (GEO-3116): any write of a value
 * carrying a `Blob` over `limitBytes` throws `UnknownError: Error preparing Blob/File data to be
 * stored in object store`. Optionally every `ArrayBuffer` write fails too, standing in for storage
 * that takes nothing at all.
 */
function failLikeWebKit({ limitBytes = 1 * MiB, arrayBuffers = false } = {}) {
  const originalPut = IDBObjectStore.prototype.put;
  const originalAdd = IDBObjectStore.prototype.add;
  const reject = (value: unknown) => {
    if (typeof value !== 'object' || value === null) return;
    for (const field of Object.values(value)) {
      if (field instanceof Blob && field.size > limitBytes) {
        throw new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError');
      }
      // `instanceof` would miss an ArrayBuffer from Node's realm under jsdom.
      if (arrayBuffers && Object.prototype.toString.call(field) === '[object ArrayBuffer]') {
        throw new DOMException('Error preparing data to be stored in object store', 'UnknownError');
      }
    }
  };
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey
  ) {
    reject(value);
    return originalPut.call(this, value, key);
  });
  const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey
  ) {
    reject(value);
    return originalAdd.call(this, value, key);
  });
  return () => {
    put.mockRestore();
    add.mockRestore();
  };
}

function recordingInput(blob: Blob, debateId = 'debate-1') {
  return {
    userId: 'user-a',
    debateId,
    blob,
    mimeType: 'video/webm',
    startedAtMs: 1_000,
    endedAtMs: 11_000,
    durationSeconds: 10,
  };
}

function patterned(size: number) {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) bytes[index] = (index * 31) & 255;
  return bytes;
}

/** Whether a blob holds exactly these bytes. `toEqual` on tens of millions of elements runs out of heap. */
async function holds(blob: Blob, bytes: Uint8Array) {
  return Buffer.from(await blob.arrayBuffer()).equals(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

/** A pre-GEO-3116 queue row, recording inline, written as the old code wrote it. */
async function legacyRow(blob: Blob, overrides: Partial<RecordingUploadQueue.DebateRecordingUpload> = {}) {
  const row: RecordingUploadQueue.DebateRecordingUpload = {
    id: 'user-a:debate-1',
    userId: 'user-a',
    debateId: 'debate-1',
    blob,
    mimeType: 'video/webm',
    startedAtMs: 1_000,
    endedAtMs: 11_000,
    durationSeconds: 10,
    byteSize: blob.size,
    width: null,
    height: null,
    framerate: null,
    videoBitsPerSecond: null,
    stage: 'queued',
    filename: null,
    multipart: null,
    attemptCount: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
  await db.debateRecordingUploads.add(row);
  return row;
}

describe('debate recording upload queue', () => {
  beforeAll(async () => {
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;
    globalThis.Blob = NodeBlob as typeof Blob;
    ({ db } = await import('~/core/database/indexeddb'));
    queue = await import('./recording-upload-queue');
  });

  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
    // Each case starts as a fresh tab would after a reload: holding no recording of its own.
    queue.forgetInMemoryRecordingsForTest();
    analytics.capture.mockClear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    db.close();
    await db.delete();
  });

  afterAll(() => {
    db.close();
  });

  it('round-trips a 60 MiB recording and its upload metadata', async () => {
    const source = patterned(60 * MiB);
    const blob = new Blob([source], { type: 'video/webm' });

    const queued = await queue.enqueueDebateRecordingUpload({
      userId: 'user-a',
      debateId: 'debate-1',
      blob,
      mimeType: 'video/webm',
      startedAtMs: 1_000,
      endedAtMs: 11_000,
      durationSeconds: 10,
    });

    db.close();
    await db.open();
    const [restored] = await queue.listDebateRecordingUploads('user-a');
    expect(restored).toMatchObject({
      id: queued.id,
      userId: 'user-a',
      debateId: 'debate-1',
      stage: 'queued',
      filename: null,
      attemptCount: 0,
    });
    // The row is metadata only; the bytes are in their own table, as ArrayBuffers (GEO-3116).
    expect(restored?.blob).toBeUndefined();
    expect(restored?.storage).toBe('chunks');
    expect(await db.debateRecordingUploadChunks.where('uploadId').equals(queued.id).count()).toBe(12);
    queue.forgetInMemoryRecordingsForTest();
    const read = await queue.readDebateRecordingUploadBlob(restored!);
    expect(read.size).toBe(60 * MiB);
    expect(read.type).toBe('video/webm');
    expect(await holds(read, source)).toBe(true);
  });

  it('upgrades the database without removing existing graph data', async () => {
    db.close();
    await db.delete();
    const { default: Dexie } = await import('dexie');
    const legacyDb = new Dexie('geogenesis-local');
    legacyDb.version(1).stores({ values: 'id, spaceId', relations: 'id, spaceId' });
    await legacyDb.open();
    await legacyDb.table('values').add({ id: 'value-1', spaceId: 'space-1', value: 'Preserved' });
    legacyDb.close();

    await db.open();

    expect(await db.values.get('value-1')).toMatchObject({ id: 'value-1', spaceId: 'space-1' });
    expect(db.debateRecordingUploads).toBeDefined();
  });

  it('deduplicates a recording by user and debate', async () => {
    const input = {
      userId: 'user-a',
      debateId: 'debate-1',
      blob: new Blob(['recording'], { type: 'video/webm' }),
      mimeType: 'video/webm',
      startedAtMs: 1_000,
      endedAtMs: 11_000,
      durationSeconds: 10,
    };

    const first = await queue.enqueueDebateRecordingUpload(input);
    const second = await queue.enqueueDebateRecordingUpload({ ...input, blob: new Blob(['replacement']) });

    expect(second.id).toBe(first.id);
    expect(await queue.listDebateRecordingUploads('user-a')).toHaveLength(1);
    expect((await queue.listDebateRecordingUploads('user-a'))[0]?.byteSize).toBe(input.blob.size);
  });

  it('preserves an uploaded filename across finalization retries', async () => {
    const queued = await queue.enqueueDebateRecordingUpload({
      userId: 'user-a',
      debateId: 'debate-1',
      blob: new Blob(['recording'], { type: 'video/webm' }),
      mimeType: 'video/webm',
      startedAtMs: 1_000,
      endedAtMs: 11_000,
      durationSeconds: 10,
    });

    await queue.markDebateRecordingUploaded(queued.id, 'recordings/debate-1/recording.webm');
    await queue.scheduleDebateRecordingRetry(queued.id, new Error('finalization unavailable'), 12_345);

    const [restored] = await queue.listDebateRecordingUploads('user-a');
    expect(restored).toMatchObject({
      stage: 'uploaded',
      filename: 'recordings/debate-1/recording.webm',
      attemptCount: 1,
      nextAttemptAt: 12_345,
      lastError: 'finalization unavailable',
    });
  });

  it('isolates recordings by user and deletes only confirmed uploads', async () => {
    const first = await queue.enqueueDebateRecordingUpload({
      userId: 'user-a',
      debateId: 'debate-1',
      blob: new Blob(['a']),
      mimeType: 'video/webm',
      startedAtMs: 1_000,
      endedAtMs: 11_000,
      durationSeconds: 10,
    });
    await queue.enqueueDebateRecordingUpload({
      userId: 'user-b',
      debateId: 'debate-2',
      blob: new Blob(['b']),
      mimeType: 'video/webm',
      startedAtMs: 2_000,
      endedAtMs: 12_000,
      durationSeconds: 10,
    });

    expect(await queue.listDebateRecordingUploads('user-a')).toHaveLength(1);
    expect(await queue.listDebateRecordingUploads('user-b')).toHaveLength(1);

    await queue.deleteDebateRecordingUpload(first.id);

    expect(await queue.listDebateRecordingUploads('user-a')).toHaveLength(0);
    expect(await queue.listDebateRecordingUploads('user-b')).toHaveLength(1);
    // Its bytes go with it.
    expect(await db.debateRecordingUploadChunks.where('uploadId').equals(first.id).count()).toBe(0);
    expect(await db.debateRecordingUploadChunks.count()).toBe(1);
  });

  // GEO-3116. On 1 Oct a Safari debater's ~90 MB recording never uploaded. The first attempt died
  // in IndexedDB — Dexie's `update` puts the whole row back, Blob included, and Safari would not
  // take the Blob — and every later write to the row failed the same way.
  describe('in a browser that will not store a large Blob (Safari, GEO-3116)', () => {
    it('reproduces the 1 Oct failure on a row that carries its recording inline', async () => {
      const row = await legacyRow(new Blob([patterned(2 * MiB)], { type: 'video/webm' }));
      const restore = failLikeWebKit();

      const failure = await queue
        .scheduleDebateRecordingRetry(row.id, new Error('x'), 5_000)
        .then(() => null)
        .catch((error: Error) => error);
      restore();

      // Safari reported it wrapped in Dexie's ModifyError ("Error modifying one or more objects.
      // Errors: UnknownError: ..."); the fake throws synchronously, so Dexie passes it through bare.
      expect(failure?.message).toMatch(/Error preparing Blob\/File data to be stored in object store/);
    });

    it('queues a 90 MB recording, and every later write to its row succeeds', async () => {
      const restore = failLikeWebKit();
      const source = patterned(90 * MiB);
      const queued = await queue.enqueueDebateRecordingUpload(
        recordingInput(new Blob([source], { type: 'video/webm' }))
      );

      expect(queued.storage).toBe('chunks');
      await queue.setDebateRecordingMultipart(queued.id, {
        filename: 'f',
        uploadId: 'u',
        partSize: 5 * MiB,
        uploadedPartNumbers: [1],
      });
      await queue.scheduleDebateRecordingRetry(queued.id, new Error('Load failed'), 5_000);
      await queue.markDebateRecordingUploaded(queued.id, 'recordings/debate-1.webm');
      restore();

      const [row] = await queue.listDebateRecordingUploads('user-a');
      expect(row).toMatchObject({ stage: 'uploaded', filename: 'recordings/debate-1.webm' });
      queue.forgetInMemoryRecordingsForTest();
      expect(await holds(await queue.readDebateRecordingUploadBlob(row!), source)).toBe(true);
    });

    it('moves a readable pre-GEO-3116 row onto the new storage, so its writes work again', async () => {
      const source = patterned(3 * MiB);
      const row = await legacyRow(new Blob([source], { type: 'video/webm' }));
      const restore = failLikeWebKit();

      const read = await queue.readDebateRecordingUploadBlob(row);
      expect(await holds(read, source)).toBe(true);
      await queue.scheduleDebateRecordingRetry(row.id, new Error('x'), 5_000);
      restore();

      const migrated = await queue.getDebateRecordingUpload(row.id);
      expect(migrated?.blob).toBeUndefined();
      expect(migrated).toMatchObject({ storage: 'chunks', attemptCount: 1 });
      queue.forgetInMemoryRecordingsForTest();
      expect(await holds(await queue.readDebateRecordingUploadBlob(migrated!), source)).toBe(true);
    });

    it('falls back to this tab’s copy when IndexedDB takes none of the bytes', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const restore = failLikeWebKit({ arrayBuffers: true });
      const blob = new Blob([patterned(6 * MiB)], { type: 'video/webm' });

      const queued = await queue.enqueueDebateRecordingUpload(recordingInput(blob));
      restore();

      expect(queued.storage).toBe('memory');
      expect(await db.debateRecordingUploadChunks.count()).toBe(0);
      // The tab that recorded the debate uploads from its own copy.
      expect(await queue.readDebateRecordingUploadBlob(queued)).toBe(blob);
      expect(analytics.capture).toHaveBeenCalledWith(
        'debate_recording_upload_fallback',
        expect.objectContaining({ debate_id: 'debate-1', reason: 'saved_in_memory_only', error_code: 'indexeddb' })
      );
    });

    it('fails as blob_unreadable once the only copy was in a tab that is gone', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const restore = failLikeWebKit({ arrayBuffers: true });
      const queued = await queue.enqueueDebateRecordingUpload(recordingInput(new Blob([patterned(1024)])));
      restore();
      queue.forgetInMemoryRecordingsForTest();

      await expect(queue.readDebateRecordingUploadBlob(queued)).rejects.toMatchObject({ code: 'blob_unreadable' });
    });
  });

  it('fails as blob_unreadable when a stored recording cannot be read back', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unreadable = new Blob([patterned(1024)]);
    vi.spyOn(unreadable, 'arrayBuffer').mockRejectedValue(new DOMException('gone', 'NotReadableError'));

    await expect(
      queue.readDebateRecordingUploadBlob({ ...(await legacyRow(new Blob(['x']))), blob: unreadable })
    ).rejects.toMatchObject({ code: 'blob_unreadable' });
  });

  it('fails as blob_unreadable when stored chunks are missing', async () => {
    const queued = await queue.enqueueDebateRecordingUpload(recordingInput(new Blob([patterned(12 * MiB)])));
    queue.forgetInMemoryRecordingsForTest();
    await db.debateRecordingUploadChunks.delete([queued.id, 1]);

    await expect(queue.readDebateRecordingUploadBlob(queued)).rejects.toMatchObject({ code: 'blob_unreadable' });
  });

  it('keeps a failed upload, bytes and all, until it is retried', async () => {
    const queued = await queue.enqueueDebateRecordingUpload({
      ...recordingInput(new Blob([patterned(1024)])),
      multipart: { filename: 'f', uploadId: 'u', partSize: 5 * MiB, uploadedPartNumbers: [] },
    });
    await queue.markDebateRecordingUploadFailed(queued.id, 'retries_exhausted', new TypeError('Load failed'));

    const failed = await queue.getDebateRecordingUpload(queued.id);
    expect(queue.isDebateRecordingUploadFailed(failed!)).toBe(true);
    expect(failed).toMatchObject({ failedReason: 'retries_exhausted', lastError: 'Load failed' });
    expect(await db.debateRecordingUploadChunks.where('uploadId').equals(queued.id).count()).toBe(1);

    await queue.retryFailedDebateRecordingUpload(queued.id, 50_000);
    const retried = await queue.getDebateRecordingUpload(queued.id);
    expect(queue.isDebateRecordingUploadFailed(retried!)).toBe(false);
    expect(retried).toMatchObject({ attemptCount: 0, nextAttemptAt: 50_000, retriesStartedAt: 50_000 });
    // Still within R2's multipart lifetime, so the streamed parts are kept.
    expect(retried?.multipart).not.toBeNull();
  });

  it('sends a retried recording whole once its streamed parts have expired', async () => {
    const queued = await queue.enqueueDebateRecordingUpload({
      ...recordingInput(new Blob([patterned(1024)])),
      multipart: { filename: 'f', uploadId: 'u', partSize: 5 * MiB, uploadedPartNumbers: [1] },
    });
    await queue.markDebateRecordingUploadFailed(queued.id, 'retries_exhausted', new Error('x'));

    await queue.retryFailedDebateRecordingUpload(queued.id, queued.createdAt + 8 * 24 * 60 * 60_000);

    expect(await queue.getDebateRecordingUpload(queued.id)).toMatchObject({ multipart: null, stage: 'queued' });
  });
});
