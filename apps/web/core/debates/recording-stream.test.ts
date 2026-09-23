import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { Blob as NodeBlob } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { db as database } from '~/core/database/indexeddb';

import type * as RecordingStream from './recording-stream';

let db: typeof database;
let stream: typeof RecordingStream;
let GeoChatRequestError: typeof import('./api').GeoChatRequestError;

const PART = 8;

/** Timers the test runs by hand, so a streamer's schedule is fully deterministic. */
function manualTimers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    setTimer: (callback: () => void) => {
      const id = next++;
      pending.set(id, callback);
      return id;
    },
    clearTimer: (id: unknown) => {
      pending.delete(id as number);
    },
    /** Runs every due callback, and whatever they schedule, until nothing is left. */
    async drain() {
      for (let round = 0; round < 100 && pending.size > 0; round += 1) {
        const [id, callback] = pending.entries().next().value!;
        pending.delete(id);
        callback();
        await flush();
      }
    },
    get size() {
      return pending.size;
    },
  };
}

async function flush() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

async function text(blob: Blob) {
  return Buffer.from(await blob.arrayBuffer()).toString();
}

function transport() {
  const sent: { partNumber: number; body: string }[] = [];
  return {
    sent,
    startMultipart: vi.fn(async () => ({ filename: 'rec/1.local.webm', upload_id: 'upload-1', part_size: PART })),
    getPartUrls: vi.fn(async (_filename: string, _uploadId: string, partNumbers: number[]) =>
      partNumbers.map(partNumber => ({
        part_number: partNumber,
        upload: {
          method: 'PUT',
          url: `https://r2.test/part/${partNumber}`,
          headers: {},
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
      }))
    ),
    putPart: vi.fn(async (upload: { url: string }, body: Blob) => {
      sent.push({ partNumber: Number(upload.url.split('/').pop()), body: await text(body) });
    }),
    abortMultipart: vi.fn(async () => undefined),
  };
}

describe('debate recording streaming', () => {
  beforeAll(async () => {
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;
    globalThis.Blob = NodeBlob as typeof Blob;
    ({ db } = await import('~/core/database/indexeddb'));
    stream = await import('./recording-stream');
    ({ GeoChatRequestError } = await import('./api'));
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

  describe('RecordingPartStreamer', () => {
    it('cuts parts on exact part-size boundaries of uneven timeslices and holds back the tail', async () => {
      const timers = manualTimers();
      const wire = transport();
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, shouldPause: () => false });

      // 3 + 7 + 5 + 4 = 19 bytes: two whole 8-byte parts and a 3-byte tail.
      for (const chunk of ['abc', 'defghij', 'klmno', 'pqrs']) streamer.append(new Blob([chunk]));
      await timers.drain();

      expect(wire.sent).toEqual([
        { partNumber: 1, body: 'abcdefgh' },
        { partNumber: 2, body: 'ijklmnop' },
      ]);
      expect(await streamer.finish()).toEqual({
        filename: 'rec/1.local.webm',
        uploadId: 'upload-1',
        partSize: PART,
        uploadedPartNumbers: [1, 2],
      });
      // The tail is the queue's job, after the recorder has stopped.
      expect(wire.putPart).toHaveBeenCalledTimes(2);
    });

    it('sends nothing while the call is struggling, and catches up once it recovers', async () => {
      const timers = manualTimers();
      const wire = transport();
      let poor = true;
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, shouldPause: () => poor });

      streamer.append(new Blob(['0123456789abcdefXYZ']));
      await timers.drain();
      // Paused: re-checking on a timer, but not so much as opening the upload.
      expect(wire.startMultipart).not.toHaveBeenCalled();

      poor = false;
      await timers.drain();
      expect(wire.sent.map(part => part.partNumber)).toEqual([1, 2]);
      await streamer.finish();
    });

    it('retries a failed part rather than skipping it', async () => {
      const timers = manualTimers();
      const wire = transport();
      wire.putPart.mockRejectedValueOnce(new Error('network down'));
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, shouldPause: () => false });

      streamer.append(new Blob(['01234567']));
      await timers.drain();

      expect(wire.putPart).toHaveBeenCalledTimes(2);
      expect((await streamer.finish())?.uploadedPartNumbers).toEqual([1]);
    });

    it('stands down for good against a geo-chat without the multipart routes', async () => {
      const timers = manualTimers();
      const wire = transport();
      wire.startMultipart.mockRejectedValue(new GeoChatRequestError('404 Not Found', null, 404));
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, shouldPause: () => false });

      streamer.append(new Blob(['0123456789abcdef']));
      await timers.drain();
      streamer.append(new Blob(['more']));
      await timers.drain();

      expect(wire.startMultipart).toHaveBeenCalledTimes(1);
      // No multipart: the queue falls back to one PUT of the whole recording.
      expect(await streamer.finish()).toBeNull();
    });

    it('records a part that was on the wire when the recorder stopped', async () => {
      const timers = manualTimers();
      const wire = transport();
      let release!: () => void;
      wire.putPart.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            release = resolve;
          })
      );
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, shouldPause: () => false });

      streamer.append(new Blob(['01234567']));
      await timers.drain();
      const finished = streamer.finish();
      release();

      expect((await finished)?.uploadedPartNumbers).toEqual([1]);
    });

    it('discards everything it sent when the recording must not publish', async () => {
      const timers = manualTimers();
      const wire = transport();
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, shouldPause: () => false });

      streamer.append(new Blob(['01234567']));
      await timers.drain();
      await streamer.abort();

      expect(wire.abortMultipart).toHaveBeenCalledWith('rec/1.local.webm', 'upload-1');
      expect(streamer.snapshot()).toBeNull();
    });
  });

  it('uploadRemainingParts sends only the parts that did not make it out live, tail included', async () => {
    const wire = transport();
    const progress: number[] = [];

    await stream.uploadRemainingParts(
      new Blob(['0123456789abcdefXYZ']),
      { filename: 'rec/1.local.webm', uploadId: 'upload-1', partSize: PART, uploadedPartNumbers: [1] },
      wire,
      (_partNumber, uploadedBytes) => {
        progress.push(uploadedBytes);
      }
    );

    expect(wire.sent).toEqual([
      { partNumber: 2, body: '89abcdef' },
      { partNumber: 3, body: 'XYZ' },
    ]);
    expect(progress).toEqual([16, 19]);
  });

  it('keeps timeslices in recording order in IndexedDB, and clears them with the stream', async () => {
    await stream.createRecordingStream('s1', metadata());
    // Written out of order, as concurrent transactions may land.
    await stream.appendRecordingChunk('s1', 1, new Blob(['world']), 2_000);
    await stream.appendRecordingChunk('s1', 0, new Blob(['hello ']), 1_000);

    const saved = await stream.getRecordingStream('s1');
    expect(saved).toMatchObject({ byteSize: 11, chunkCount: 2, lastChunkAtMs: 2_000 });
    expect(await text(await stream.readRecordingStreamBlob(saved!))).toBe('hello world');

    await stream.deleteRecordingStream('s1');
    expect(await stream.getRecordingStream('s1')).toBeUndefined();
    expect(await db.debateRecordingChunks.count()).toBe(0);
  });

  describe('recoverOrphanedRecordingStreams', () => {
    const now = () => Date.now() + stream.RECORDING_STREAM_ORPHAN_AFTER_MS + 1;

    async function orphan(debateId: string, multipart: RecordingStream.StreamedRecordingMultipart | null = null) {
      const id = `user-a:${debateId}:1`;
      await stream.createRecordingStream(id, metadata({ debateId }));
      await stream.appendRecordingChunk(id, 0, new Blob(['recorded']), 61_000);
      if (multipart) await stream.setRecordingStreamMultipart(id, multipart);
      return id;
    }

    function dependencies(overrides: Partial<RecordingStream.OrphanRecoveryDependencies> = {}) {
      return {
        getDebate: vi.fn(async () => ({ status: 'complete', recording_cancelled_at: null, recordings: [] })),
        hasQueuedUpload: vi.fn(async () => null),
        enqueue: vi.fn(async () => undefined),
        abortMultipart: vi.fn(async () => undefined),
        now,
        ...overrides,
      };
    }

    it('adopts a dead tab’s recording once its debate can accept it', async () => {
      const id = await orphan('debate-1');
      const enqueue = vi.fn(async (_stream: RecordingStream.DebateRecordingStream, _blob: Blob) => undefined);
      const deps = dependencies({ enqueue });

      await stream.recoverOrphanedRecordingStreams('user-a', deps);

      expect(enqueue).toHaveBeenCalledTimes(1);
      const [adopted, blob] = enqueue.mock.calls[0];
      expect(adopted).toMatchObject({ debateId: 'debate-1', startedAtMs: 1_000, lastChunkAtMs: 61_000 });
      expect(await text(blob)).toBe('recorded');
      expect(await stream.getRecordingStream(id)).toBeUndefined();
    });

    it('leaves a recorder that is still writing alone', async () => {
      const id = await orphan('debate-1');
      const deps = dependencies({ now: () => Date.now() });

      await stream.recoverOrphanedRecordingStreams('user-a', deps);

      expect(deps.getDebate).not.toHaveBeenCalled();
      expect(await stream.getRecordingStream(id)).toBeDefined();
    });

    it('waits on a debate that is still running', async () => {
      const id = await orphan('debate-1');
      const deps = dependencies({
        getDebate: vi.fn(async () => ({ status: 'in_progress', recording_cancelled_at: null, recordings: [] })),
      });

      await stream.recoverOrphanedRecordingStreams('user-a', deps);

      expect(deps.enqueue).not.toHaveBeenCalled();
      expect(await stream.getRecordingStream(id)).toBeDefined();
    });

    it('discards the orphan, parts and all, when the recording was cancelled', async () => {
      const multipart = { filename: 'rec/1.local.webm', uploadId: 'upload-1', partSize: PART, uploadedPartNumbers: [] };
      const id = await orphan('debate-1', multipart);
      const deps = dependencies({
        getDebate: vi.fn(async () => ({
          status: 'complete',
          recording_cancelled_at: '2026-09-22T00:00:00Z',
          recordings: [],
        })),
      });

      await stream.recoverOrphanedRecordingStreams('user-a', deps);

      expect(deps.enqueue).not.toHaveBeenCalled();
      expect(deps.abortMultipart).toHaveBeenCalledWith('debate-1', 'rec/1.local.webm', 'upload-1');
      expect(await stream.getRecordingStream(id)).toBeUndefined();
    });

    it('discards the orphan when geo-chat already has this participant’s recording', async () => {
      const id = await orphan('debate-1');
      const deps = dependencies({
        getDebate: vi.fn(async () => ({
          status: 'complete',
          recording_cancelled_at: null,
          recordings: [{ user_id: 'user-a' }],
        })),
      });

      await stream.recoverOrphanedRecordingStreams('user-a', deps);

      expect(deps.enqueue).not.toHaveBeenCalled();
      expect(await stream.getRecordingStream(id)).toBeUndefined();
    });

    it('never aborts the multipart upload the queue is itself finishing', async () => {
      const multipart = {
        filename: 'rec/1.local.webm',
        uploadId: 'upload-1',
        partSize: PART,
        uploadedPartNumbers: [1],
      };
      const id = await orphan('debate-1', multipart);
      const deps = dependencies({ hasQueuedUpload: vi.fn(async () => ({ multipartUploadId: 'upload-1' })) });

      await stream.recoverOrphanedRecordingStreams('user-a', deps);

      expect(deps.abortMultipart).not.toHaveBeenCalled();
      expect(deps.enqueue).not.toHaveBeenCalled();
      expect(await stream.getRecordingStream(id)).toBeUndefined();
    });
  });
});

function metadata(
  overrides: Partial<RecordingStream.RecordingStreamMetadata> = {}
): RecordingStream.RecordingStreamMetadata {
  return {
    userId: 'user-a',
    debateId: 'debate-1',
    mimeType: 'video/webm',
    startedAtMs: 1_000,
    width: 1280,
    height: 720,
    framerate: 30,
    videoBitsPerSecond: 2_500_000,
    ...overrides,
  };
}
