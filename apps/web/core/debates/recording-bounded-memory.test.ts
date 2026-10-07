import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { Blob as NodeBlob } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { db as database } from '~/core/database/indexeddb';

import type * as RecordingStream from './recording-stream';
import type * as RecordingUploadQueue from './recording-upload-queue';

/**
 * A debate recording held in memory only until it is safe elsewhere: a timeslice is let go of once
 * the multipart part holding it is confirmed, or — when the live upload falls behind — once it is
 * saved in IndexedDB. These check that memory stays bounded however long the recording runs, that
 * nothing is let go of that could not be had back, and that what finally reaches object storage is
 * byte for byte the `new Blob(timeslices)` the room used to build.
 */

const analytics = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('~/core/analytics', () => analytics);

let db: typeof database;
let stream: typeof RecordingStream;
let queue: typeof RecordingUploadQueue;
let GeoChatRequestError: typeof import('./api').GeoChatRequestError;

const MiB = 1024 * 1024;

/** Deterministic pseudo-random bytes and sizes, so a failure reproduces. */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

function bytesOf(size: number, seed: number) {
  const random = prng(seed);
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) bytes[index] = Math.floor(random() * 256);
  return bytes;
}

/** Timeslices of uneven size, as `MediaRecorder` hands them over, with the "header" in the first. */
function timeslices(count: number, averageBytes: number, seed = 7) {
  const random = prng(seed);
  return Array.from({ length: count }, (_, index) => {
    const size = Math.max(1, Math.round(averageBytes * (0.5 + random())));
    return new Blob([bytesOf(size, seed * 1_000 + index)]);
  });
}

async function bufferOf(blob: Blob) {
  return Buffer.from(await blob.arrayBuffer());
}

/** Byte equality. `toEqual` on tens of millions of elements runs out of heap. */
function same(actual: Buffer, expected: Buffer) {
  return actual.length === expected.length && actual.equals(expected);
}

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
    async drain() {
      for (let round = 0; round < 1_000 && pending.size > 0; round += 1) {
        const [id, callback] = pending.entries().next().value!;
        pending.delete(id);
        callback();
        await flush();
      }
    },
  };
}

async function flush() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

/** A transport that keeps every part it was sent, by part number. */
function transport(partSize: number) {
  const parts = new Map<number, Blob>();
  return {
    parts,
    startMultipart: vi.fn(async () => ({ filename: 'rec/1.local.webm', upload_id: 'upload-1', part_size: partSize })),
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
      parts.set(Number(upload.url.split('/').pop()), body);
    }),
    abortMultipart: vi.fn(async () => undefined),
  };
}

/** The object the server assembles: every part, in part-number order (geo-chat sorts by it). */
async function assembled(parts: Map<number, Blob>) {
  const numbers = [...parts.keys()].sort((a, b) => a - b);
  expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  return bufferOf(new Blob(numbers.map(number => parts.get(number)!)));
}

/** Waits for the stream's IndexedDB row to count `chunks` timeslices, polling every macrotask. */
async function savedChunks(streamId: string, chunks: number) {
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    if ((await stream.getRecordingStream(streamId))?.chunkCount === chunks) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`stream ${streamId} never saved ${chunks} timeslices`);
}

function metadata(): RecordingStream.RecordingStreamMetadata {
  return {
    userId: 'user-a',
    debateId: 'debate-1',
    mimeType: 'video/webm',
    startedAtMs: 1_000,
    width: 1280,
    height: 720,
    framerate: 30,
    videoBitsPerSecond: 2_500_000,
  };
}

describe('bounded recording memory', () => {
  beforeAll(async () => {
    globalThis.indexedDB = indexedDB;
    globalThis.IDBKeyRange = IDBKeyRange;
    globalThis.Blob = NodeBlob as typeof Blob;
    ({ db } = await import('~/core/database/indexeddb'));
    stream = await import('./recording-stream');
    queue = await import('./recording-upload-queue');
    ({ GeoChatRequestError } = await import('./api'));
  });

  beforeEach(async () => {
    analytics.capture.mockReset();
    db.close();
    await db.delete();
    await db.open();
    queue.forgetInMemoryRecordingsForTest();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    db.close();
    await db.delete();
  });

  afterAll(() => {
    db.close();
  });

  describe('RecordingChunkLedger', () => {
    it('lets go of a timeslice once every byte of it is confirmed, and keeps one a part boundary cuts', async () => {
      const ledger = new stream.RecordingChunkLedger();
      for (const chunk of ['abc', 'defghij', 'klmno', 'pqrs']) ledger.append(new Blob([chunk]));

      ledger.confirm(8);
      // 'abc' (0-3) is wholly in part 1; 'defghij' (3-10) straddles the boundary and stays.
      expect(ledger.retainedBytes).toBe(16);
      expect(await (await ledger.read(8, 19)).text()).toBe('ijklmnopqrs');
      await expect(ledger.read(0, 8)).rejects.toMatchObject({ code: 'blob_unreadable' });

      ledger.confirm(16);
      // Only 'pqrs' (15-19) is left: the tail no part holds yet.
      expect(ledger.retainedBytes).toBe(4);
      expect(await (await ledger.read(16, 19)).text()).toBe('qrs');
    });

    it('spills only timeslices saved to IndexedDB, oldest first, and reads them back', async () => {
      const ledger = new stream.RecordingChunkLedger();
      for (const chunk of ['aaaa', 'bbbb', 'cccc', 'dddd']) ledger.append(new Blob([chunk]));
      ledger.markDurable(0);
      ledger.markDurable(2);

      ledger.spill(4);
      // 'aaaa' and 'cccc' are saved and let go of; 'bbbb' and 'dddd' are not saved and are kept,
      // even though that leaves more than the limit held.
      expect(ledger.retainedBytes).toBe(8);
      expect(ledger.spilledChunks).toBe(2);

      const saved = new Map([
        [0, new TextEncoder().encode('aaaa').buffer as ArrayBuffer],
        [2, new TextEncoder().encode('cccc').buffer as ArrayBuffer],
      ]);
      const readDurable = vi.fn(async (seqs: number[]) => new Map(seqs.map(seq => [seq, saved.get(seq)!])));
      expect(await (await ledger.read(0, 16, readDurable)).text()).toBe('aaaabbbbccccdddd');
      expect(readDurable).toHaveBeenCalledWith([0, 2]);
      // Without IndexedDB to read from, a spilled timeslice is not silently skipped.
      await expect(ledger.read(0, 16)).rejects.toMatchObject({ code: 'blob_unreadable' });
    });

    it('fails, rather than returning short bytes, when IndexedDB does not have a spilled timeslice whole', async () => {
      const ledger = new stream.RecordingChunkLedger();
      ledger.append(new Blob(['aaaa']));
      ledger.markDurable(0);
      ledger.spill(0);

      await expect(
        ledger.read(0, 4, async () => new Map([[0, new TextEncoder().encode('aa').buffer as ArrayBuffer]]))
      ).rejects.toMatchObject({ code: 'blob_unreadable' });
      await expect(ledger.read(0, 4, async () => new Map())).rejects.toMatchObject({ code: 'blob_unreadable' });
    });

    it('lets go of nothing once frozen', async () => {
      const ledger = new stream.RecordingChunkLedger();
      ledger.append(new Blob(['aaaa']));
      ledger.append(new Blob(['bbbb']));
      ledger.markDurable(1);
      ledger.freeze();

      ledger.confirm(8);
      ledger.spill(0);

      expect(ledger.retainedBytes).toBe(8);
      expect(await (await ledger.read(0, 8)).text()).toBe('aaaabbbb');
    });
  });

  describe('RecordingPartStreamer', () => {
    it('frees each timeslice once the part holding it is acknowledged', async () => {
      const timers = manualTimers();
      const wire = transport(8);
      const ledger = new stream.RecordingChunkLedger();
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, ledger, shouldPause: () => false });

      for (const chunk of ['abc', 'defghij', 'klmno', 'pqrs']) streamer.append(new Blob([chunk]));
      expect(ledger.retainedBytes).toBe(19);
      await timers.drain();

      expect([...wire.parts.keys()]).toEqual([1, 2]);
      expect(streamer.confirmedBytes()).toBe(16);
      expect(ledger.retainedBytes).toBe(4);
    });

    it('frees nothing while a part keeps failing, then catches up once it lands', async () => {
      const timers = manualTimers();
      const wire = transport(8);
      wire.putPart.mockRejectedValueOnce(new Error('network down')).mockRejectedValueOnce(new Error('still down'));
      const ledger = new stream.RecordingChunkLedger();
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, ledger, shouldPause: () => false });

      streamer.append(new Blob(['01234567']));
      streamer.append(new Blob(['89abcdef']));
      // Only the first failure has happened: nothing is confirmed, so nothing is let go of.
      await flush();
      await flush();
      expect(ledger.retainedBytes).toBe(16);

      await timers.drain();
      expect(streamer.confirmedBytes()).toBe(16);
      expect(ledger.retainedBytes).toBe(0);
      expect(await bufferOf(new Blob([wire.parts.get(1)!, wire.parts.get(2)!]))).toEqual(
        Buffer.from('0123456789abcdef')
      );
    });

    it('frees nothing against a geo-chat without the multipart routes', async () => {
      const timers = manualTimers();
      const wire = transport(8);
      wire.startMultipart.mockRejectedValue(new GeoChatRequestError('404 Not Found', null, 404));
      const ledger = new stream.RecordingChunkLedger();
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, ledger, shouldPause: () => false });

      for (const chunk of timeslices(20, 10)) streamer.append(chunk);
      await timers.drain();

      expect(await streamer.finish()).toBeNull();
      expect(ledger.retainedBytes).toBe(ledger.size);
    });

    it('holds one part plus a timeslice once each part is acknowledged, through a 17-minute recording at 2.5 Mbps', async () => {
      const timers = manualTimers();
      const partSize = 5 * MiB;
      // Keep only sizes, not 330 MB of bodies — a `vi.fn` would keep every one in `mock.calls`.
      const sent: number[] = [];
      const wire = {
        ...transport(partSize),
        putPart: async (_upload: { url: string }, body: Blob) => {
          sent.push(body.size);
        },
      };
      const ledger = new stream.RecordingChunkLedger();
      const streamer = new stream.RecordingPartStreamer({ ...wire, ...timers, ledger, shouldPause: () => false });

      // One timeslice a second for 17 minutes: ~312 KB each at 2.5 Mbps, varied ±50%.
      const seconds = 17 * 60;
      const random = prng(3);
      let largestChunk = 0;
      for (let second = 0; second < seconds; second += 1) {
        const size = Math.round(312_500 * (0.5 + random()));
        largestChunk = Math.max(largestChunk, size);
        streamer.append(new Blob([new Uint8Array(size)]));
        await timers.drain();
        // Once the part a timeslice completed is acknowledged: the bytes no part holds yet (under
        // one part), plus the one timeslice a part boundary cuts, which is let go of whole.
        expect(ledger.retainedBytes).toBeLessThanOrEqual(partSize + largestChunk);
      }

      expect(ledger.size).toBeGreaterThan(300 * 1_000_000);
      expect(sent.every(size => size === partSize)).toBe(true);
      expect(sent.length).toBe(Math.floor(ledger.size / partSize));
      // The instant a timeslice completes a part, before it is sent, one more timeslice is held.
      // Either way a few megabytes over a part — not the ~320 MB the room used to hold by the end.
      expect(ledger.peakRetainedBytes).toBeLessThanOrEqual(partSize + 2 * largestChunk);
      expect(ledger.peakRetainedBytes).toBeLessThan(ledger.size / 50);
    });
  });

  describe('startLiveRecordingStream', () => {
    it('spills to IndexedDB while the upload stands down for the call, and loses nothing', async () => {
      const wire = transport(64);
      const live = stream.startLiveRecordingStream({
        id: 'user-a:debate-1:1',
        metadata: metadata(),
        transport: wire,
        // Poor connection the whole debate: the upload opens, but no part goes out live in the
        // under-a-minute this takes.
        shouldPause: () => 'connection_poor',
        retainedBytesLimit: 100,
      });
      const chunks = timeslices(40, 30);
      for (const [index, chunk] of chunks.entries()) {
        live.append(chunk, 1_000 + index * 1_000);
        await savedChunks(live.id, index + 1);
      }

      expect(await live.finish()).toMatchObject({ uploadedPartNumbers: [] });
      const event = analytics.capture.mock.calls.find(([name]) => name === 'debate_recording_stream_finished')?.[1];
      expect(event).toMatchObject({ saved_locally: true, streaming: 'on', parts_uploaded_live: 0 });
      expect(event.spilled_chunks).toBeGreaterThan(30);

      const recording = live.recording();
      expect(recording.availableFrom).toBe(0);
      expect(recording.heldInMemory).toBe(false);
      expect(await bufferOf(await recording.read(0, recording.size))).toEqual(await bufferOf(new Blob(chunks)));
    });

    it('keeps every timeslice in memory when neither IndexedDB nor the upload will take them', async () => {
      vi.spyOn(db.debateRecordingStreams, 'put').mockRejectedValue(new DOMException('quota', 'QuotaExceededError'));
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const wire = transport(64);
      wire.startMultipart.mockRejectedValue(new GeoChatRequestError('404 Not Found', null, 404));
      const live = stream.startLiveRecordingStream({
        id: 'user-a:debate-1:1',
        metadata: metadata(),
        transport: wire,
        shouldPause: () => false,
        retainedBytesLimit: 10,
      });
      const chunks = timeslices(40, 30);
      for (const chunk of chunks) live.append(chunk, 2_000);
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(await live.finish()).toBeNull();
      const recording = live.recording();
      expect(recording).toMatchObject({ availableFrom: 0, heldInMemory: true });
      expect(await bufferOf(await recording.read(0, recording.size))).toEqual(await bufferOf(new Blob(chunks)));
    });

    it('hands the queue only the bytes no confirmed part holds', async () => {
      const wire = transport(64);
      const live = stream.startLiveRecordingStream({
        id: 'user-a:debate-1:1',
        metadata: metadata(),
        transport: wire,
        shouldPause: () => false,
      });
      const chunks = timeslices(20, 30);
      for (const [index, chunk] of chunks.entries()) {
        live.append(chunk, 1_000 + index * 1_000);
        await savedChunks(live.id, index + 1);
      }
      const total = new Blob(chunks).size;
      await vi.waitFor(() => expect(wire.parts.size).toBe(Math.floor(total / 64)));

      const multipart = await live.finish();
      const recording = live.recording();
      expect(recording.availableFrom).toBe(multipart!.uploadedPartNumbers.length * 64);
      expect(recording.heldInMemory).toBe(true);
      await expect(recording.read(0, 64)).rejects.toMatchObject({ code: 'blob_unreadable' });
      expect(await bufferOf(await recording.read(recording.availableFrom, total))).toEqual(
        (await bufferOf(new Blob(chunks))).subarray(recording.availableFrom)
      );
    });
  });

  describe('a streamed recording from first timeslice to assembled object', () => {
    /**
     * Records `chunks` through a live stream whose upload stands down after `liveParts` parts, as a
     * call that turns poor partway through, then hands it to the real queue and finishes it the way
     * the coordinator does. Returns the object geo-chat would assemble.
     */
    async function recordAndUpload(
      chunks: Blob[],
      {
        partSize,
        liveParts,
        inMemory,
        outage = false,
      }: { partSize: number; liveParts: number; inMemory: boolean; outage?: boolean }
    ) {
      const wire = transport(partSize);
      // `outage`: every part after the first `liveParts` fails on the wire until the debate ends,
      // rather than the upload standing down for a poor call.
      let networkDown = false;
      let debating = true;
      const send = wire.putPart.getMockImplementation()!;
      wire.putPart.mockImplementation(async (upload, body) => {
        if (networkDown) throw new TypeError('Load failed');
        await send(upload, body);
        if (outage && debating && wire.parts.size >= liveParts) networkDown = true;
      });
      const live = stream.startLiveRecordingStream({
        id: 'user-a:debate-1:1',
        metadata: metadata(),
        transport: wire,
        shouldPause: () => !outage && wire.parts.size >= liveParts,
        retainedBytesLimit: 2 * partSize,
      });
      for (const [index, chunk] of chunks.entries()) {
        live.append(chunk, 1_000 + index * 1_000);
        await savedChunks(live.id, index + 1);
      }
      const multipart = await live.finish();
      expect(multipart?.uploadedPartNumbers).toEqual(Array.from({ length: liveParts }, (_, index) => index + 1));
      // The connection is back by the time the queue sends the rest.
      debating = false;
      networkDown = false;

      const queued = await queue.enqueueDebateRecordingUpload({
        userId: 'user-a',
        debateId: 'debate-1',
        recording: live.recording(),
        mimeType: 'video/webm',
        startedAtMs: 1_000,
        endedAtMs: 1_000 + chunks.length * 1_000,
        durationSeconds: chunks.length,
        multipart,
      });
      // The queue row is the recording's home now, as in the room.
      await live.release();
      if (!inMemory) queue.forgetInMemoryRecordingsForTest();

      const row = (await queue.getDebateRecordingUpload(queued.id))!;
      const bytes = await queue.readDebateRecordingUploadBytes(row);
      await stream.uploadRemainingParts(bytes, row.multipart!, wire, () => undefined);
      return { row, parts: wire.parts };
    }

    it('assembles byte for byte what the old in-memory blob held, from IndexedDB after a reload', async () => {
      const partSize = 5 * MiB;
      // ~24 MB: two parts out live before the call turns poor; the ~14 MB rest is sent afterwards.
      const chunks = timeslices(80, 300_000);
      const today = await bufferOf(new Blob(chunks, { type: 'video/webm' }));

      const { row, parts } = await recordAndUpload(chunks, { partSize, liveParts: 2, inMemory: false });

      expect(row.byteSize).toBe(today.length);
      expect(row.localFromByte).toBe(2 * partSize);
      // Only the tail is stored: the parts that went out live are not kept a second time.
      const stored = await db.debateRecordingUploadChunks.where('uploadId').equals(row.id).toArray();
      expect(stored.reduce((sum, chunk) => sum + chunk.data.byteLength, 0)).toBe(today.length - 2 * partSize);
      expect(same(await assembled(parts), today)).toBe(true);
      // The first timeslice — the WebM header — opens part 1.
      expect(same((await bufferOf(parts.get(1)!)).subarray(0, chunks[0].size), await bufferOf(chunks[0]))).toBe(true);
    });

    it('recovers the whole recording when parts fail partway through the debate', async () => {
      const chunks = timeslices(60, 300, 13);
      const today = await bufferOf(new Blob(chunks));

      const { row, parts } = await recordAndUpload(chunks, {
        partSize: 2_048,
        liveParts: 2,
        inMemory: false,
        outage: true,
      });

      // Nothing past the last confirmed part was let go of while the parts were failing.
      expect(row.localFromByte).toBe(2 * 2_048);
      expect(same(await assembled(parts), today)).toBe(true);
    });

    it('assembles the same bytes from this tab’s own copy', async () => {
      const chunks = timeslices(60, 300, 11);
      const today = await bufferOf(new Blob(chunks));

      const { parts } = await recordAndUpload(chunks, { partSize: 2_048, liveParts: 1, inMemory: true });

      expect(same(await assembled(parts), today)).toBe(true);
    });

    it('resends only the parts it still holds when the server reports parts missing', async () => {
      const chunks = timeslices(40, 300, 5);
      const { row } = await recordAndUpload(chunks, { partSize: 2_048, liveParts: 1, inMemory: false });
      await db.debateRecordingUploads.update(row.id, {
        multipart: { ...row.multipart!, uploadedPartNumbers: [1, 2, 3] },
      });

      await queue.requeueDebateRecordingParts(row.id);

      // Part 1 is not on this device to send again; parts 2 and 3 are.
      expect((await queue.getDebateRecordingUpload(row.id))?.multipart?.uploadedPartNumbers).toEqual([1]);
    });

    it('cannot be sent as one PUT once only its tail is kept, and says so', async () => {
      const chunks = timeslices(40, 300, 9);
      const { row } = await recordAndUpload(chunks, { partSize: 2_048, liveParts: 1, inMemory: false });

      await expect(queue.readDebateRecordingUploadBlob(row)).rejects.toMatchObject({ code: 'blob_unreadable' });
    });
  });
});
