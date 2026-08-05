import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { Blob as NodeBlob } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { db as database } from '~/core/database/indexeddb';

import type * as RecordingUploadQueue from './recording-upload-queue';

let db: typeof database;
let queue: typeof RecordingUploadQueue;

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
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  afterAll(() => {
    db.close();
  });

  it('round-trips a 60 MiB recording blob and its upload metadata', async () => {
    const blob = new Blob([new Uint8Array(60 * 1024 * 1024)], { type: 'video/webm' });

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
    expect(restored?.blob).toBeInstanceOf(Blob);
    expect(restored?.blob.size).toBe(60 * 1024 * 1024);
    expect(restored?.blob.type).toBe('video/webm');
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
    expect((await queue.listDebateRecordingUploads('user-a'))[0]?.blob.size).toBe(input.blob.size);
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
  });
});
