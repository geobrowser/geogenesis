import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { Blob as NodeBlob } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { db as database } from '~/core/database/indexeddb';

import type * as RecordingStream from './recording-stream';

const analytics = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('~/core/analytics', () => analytics);

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
    /** Runs the oldest pending callback only. */
    async runNext() {
      const entry = pending.entries().next().value;
      if (!entry) return;
      pending.delete(entry[0]);
      entry[1]();
      await flush();
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
    analytics.capture.mockReset();
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

    it('opens the upload but sends no part while the call is struggling, and catches up once it recovers', async () => {
      const timers = manualTimers();
      const wire = transport();
      let poor = true;
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, shouldPause: () => poor });

      streamer.append(new Blob(['0123456789abcdefXYZ']));
      // A few rechecks: well inside the longest pause, so nothing is sent.
      for (let round = 0; round < 5; round += 1) await timers.runNext();
      // Opening the upload is one small request, never held back for the call (GEO-3171).
      expect(wire.startMultipart).toHaveBeenCalledOnce();
      expect(wire.putPart).not.toHaveBeenCalled();

      poor = false;
      await timers.drain();
      expect(wire.sent.map(part => part.partNumber)).toEqual([1, 2]);
      await streamer.finish();
    });

    // GEO-3171. One debater's call read as struggling from the first second to the last. The pause
    // was checked before the upload was even opened, so it never was: `streaming: 'never_started'`,
    // `paused_ms` the whole debate, and the whole recording left to one upload afterwards.
    it('streams through a pause that never lifts, a part per stretch, and says why it paused', async () => {
      const timers = manualTimers();
      const wire = transport();
      const stalls: unknown[] = [];
      const streamer = new stream.RecordingPartStreamer({
        ...wire,
        ...timers,
        shouldPause: () => 'connection_poor',
        onStall: stall => stalls.push(stall),
      });

      streamer.append(new Blob(['0123456789abcdefXYZ']));
      await timers.drain();

      // Both whole parts went out, each after a full stretch of standing down.
      expect(wire.sent.map(part => part.partNumber)).toEqual([1, 2]);
      const stats = streamer.stats();
      expect(stats).toMatchObject({
        streaming: 'on',
        parts_uploaded_live: 2,
        parts_sent_through_pause: 2,
        paused_connection_poor_ms: 2 * stream.MAX_CONTINUOUS_PAUSE_MS,
        paused_room_not_connected_ms: 0,
        paused_offline_ms: 0,
      });
      expect(stats.paused_ms).toBe(2 * stream.MAX_CONTINUOUS_PAUSE_MS);
      // It streamed, so it never stalled.
      expect(stalls).toEqual([]);
      expect((await streamer.finish())?.uploadedPartNumbers).toEqual([1, 2]);
    });

    it('keeps trying to open the upload, and reports the stall with why', async () => {
      const timers = manualTimers();
      const wire = transport();
      wire.startMultipart.mockRejectedValue(new Error('network down'));
      const stalls: RecordingStream.RecordingStreamStall[] = [];
      const streamer = new stream.RecordingPartStreamer({
        ...wire,
        ...timers,
        shouldPause: () => 'offline',
        onStall: stall => stalls.push(stall),
      });

      streamer.append(new Blob(['0123456789abcdef']));
      await timers.drain();

      // Past the three attempts that used to switch streaming off for the rest of the debate.
      expect(wire.startMultipart.mock.calls.length).toBeGreaterThan(5);
      expect(stalls).toEqual([
        expect.objectContaining({ reason: 'start_failed', pause_reason: 'offline', bytes_recorded: 16 }),
      ]);
      expect(await streamer.finish()).toBeNull();
      expect(streamer.stats()).toMatchObject({ streaming: 'never_started', parts_uploaded_live: 0 });
      // Reported once, not again at the end.
      expect(stalls).toHaveLength(1);
    });

    it('reports a recording that never streamed when it stops, if the stall check had not come round', async () => {
      const timers = manualTimers();
      const wire = transport();
      wire.startMultipart.mockRejectedValue(new GeoChatRequestError('404 Not Found', null, 404));
      const stalls: RecordingStream.RecordingStreamStall[] = [];
      const streamer = new stream.RecordingPartStreamer({
        ...wire,
        ...timers,
        shouldPause: () => false,
        onStall: stall => stalls.push(stall),
      });

      streamer.append(new Blob(['0123']));
      await timers.runNext();
      await streamer.finish();

      expect(stalls).toEqual([expect.objectContaining({ reason: 'routes_missing', pause_reason: null })]);
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

    it('goes quiet when no whole part is waiting, and sends one as soon as a timeslice completes it', async () => {
      const timers = manualTimers();
      const wire = transport();
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, shouldPause: () => false });

      streamer.append(new Blob(['0123456789abcdefXYZ']));
      await timers.drain();
      expect(wire.sent.map(part => part.partNumber)).toEqual([1, 2]);
      // Nothing left to send until the recorder hands over more bytes, so nothing is scheduled.
      expect(timers.size).toBe(0);

      streamer.append(new Blob(['01234']));
      await timers.drain();
      expect(wire.sent.map(part => part.partNumber)).toEqual([1, 2, 3]);
      expect(timers.size).toBe(0);
      await streamer.finish();
    });

    it('sends a part completed while another was on the wire', async () => {
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
      // Part 1 is on the wire; this completes part 2.
      streamer.append(new Blob(['89abcdef']));
      release();
      await flush();
      await timers.drain();

      expect(wire.putPart).toHaveBeenCalledTimes(2);
      expect((await streamer.finish())?.uploadedPartNumbers).toEqual([1, 2]);
    });
  });

  it('reports one summary of how the live upload went when the recording is handed over', async () => {
    const wire = transport();
    const live = stream.startLiveRecordingStream({
      id: 'user-a:debate-1:1',
      metadata: metadata(),
      transport: {
        ...wire,
        startMultipart: async () => ({ filename: 'rec/1.local.webm', upload_id: 'upload-1', part_size: 5 }),
      },
      shouldPause: () => false,
    });
    live.append(new Blob(['0123456789ab']), 2_000);
    await new Promise(resolve => setTimeout(resolve, 20));

    await live.finish();

    expect(analytics.capture).toHaveBeenCalledWith(
      'debate_recording_stream_finished',
      expect.objectContaining({
        debate_id: 'debate-1',
        streaming: 'on',
        bytes_recorded: 12,
        parts_uploaded_live: 2,
        total_parts: 3,
        saved_locally: true,
      })
    );
  });

  it('reports a recording that is not streaming as an upload fallback, with the reason', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const wire = transport();
    wire.startMultipart.mockRejectedValue(new Error('network down'));
    const live = stream.startLiveRecordingStream({
      id: 'user-a:debate-1:1',
      metadata: metadata(),
      transport: wire,
      shouldPause: () => 'connection_poor',
    });
    live.append(new Blob(['0123456789ab']), 2_000);
    await vi.waitFor(() => expect(wire.startMultipart).toHaveBeenCalled());

    await live.finish();

    expect(analytics.capture).toHaveBeenCalledWith(
      'debate_recording_upload_fallback',
      expect.objectContaining({
        debate_id: 'debate-1',
        reason: 'stream_not_started',
        stall_reason: 'start_failed',
        pause_reason: 'connection_poor',
        bytes_recorded: 12,
      })
    );
    expect(analytics.capture).toHaveBeenCalledWith(
      'debate_recording_stream_finished',
      expect.objectContaining({ streaming: 'never_started', start_failures: 1 })
    );
  });

  it('stops streaming when the room lets go of a recording, and keeps it for recovery', async () => {
    const wire = transport();
    let wakeups = 0;
    const live = stream.startLiveRecordingStream({
      id: 'user-a:debate-1:1',
      metadata: metadata(),
      transport: {
        ...wire,
        startMultipart: async () => ({ filename: 'rec/1.local.webm', upload_id: 'upload-1', part_size: 5 }),
      },
      shouldPause: () => {
        wakeups += 1;
        return false;
      },
    });
    live.append(new Blob(['0123456789ab']), 2_000);
    await vi.waitFor(() => expect(wire.putPart).toHaveBeenCalledTimes(2));

    await live.detach();
    const atDetach = { wakeups, puts: wire.putPart.mock.calls.length };
    // A whole part's worth more would go out at once if anything were still streaming.
    live.append(new Blob(['cdefg']), 3_000);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(wakeups).toBe(atDetach.wakeups);
    expect(wire.putPart).toHaveBeenCalledTimes(atDetach.puts);
    // Left for `recoverOrphanedRecordingStreams`: the chunks, and the upload with what reached R2.
    const saved = await stream.getRecordingStream('user-a:debate-1:1');
    expect(saved?.byteSize).toBe(17);
    expect(saved?.multipart).toEqual(expect.objectContaining({ uploadId: 'upload-1', uploadedPartNumbers: [1, 2] }));
    expect(wire.abortMultipart).not.toHaveBeenCalled();
    expect(analytics.capture).not.toHaveBeenCalledWith('debate_recording_stream_finished', expect.anything());
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

  // GEO-3116: no Blob is handed to IndexedDB, which Safari could not reliably store.
  it('stores timeslices as bytes, and still reads chunks saved as Blobs before', async () => {
    await stream.createRecordingStream('s1', metadata());
    await stream.appendRecordingChunk('s1', 1, new Blob(['world']), 2_000);
    // A chunk an earlier version wrote, as a Blob.
    await db.debateRecordingChunks.put({ streamId: 's1', seq: 0, blob: new Blob(['hello ']) });

    const stored = await db.debateRecordingChunks.get(['s1', 1]);
    expect(stored?.blob).toBeUndefined();
    expect(Object.prototype.toString.call(stored?.data)).toBe('[object ArrayBuffer]');
    expect(await text(await stream.readRecordingStreamBlob((await stream.getRecordingStream('s1'))!))).toBe(
      'hello world'
    );
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
      expect(analytics.capture).toHaveBeenCalledWith(
        'debate_recording_orphan',
        expect.objectContaining({ debate_id: 'debate-1', outcome: 'recovered', bytes: 8 })
      );
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
      expect(analytics.capture).toHaveBeenCalledWith(
        'debate_recording_orphan',
        expect.objectContaining({ outcome: 'discarded_cancelled' })
      );
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
