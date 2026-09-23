import { capture } from '~/core/analytics';
import { db } from '~/core/database/indexeddb';

import { GeoChatRequestError, type LocalRecordingPartUrl, type ObjectStoreUpload } from './api';

/**
 * Streaming a debate recording while it is made (GEO-2955).
 *
 * Until this, every `MediaRecorder` timeslice sat in an in-tab array and nothing was written
 * anywhere durable until the debate ended — a tab crash at minute 4 of 5 lost all of it, and
 * because both slots are required to publish, took the opponent's debate with it. Two things
 * change here, and they are independent:
 *
 * 1. **Each timeslice is written to IndexedDB as it arrives** (`appendRecordingChunk`), so the
 *    unprotected window shrinks from "the whole debate" to "the last second".
 * 2. **The recording goes to R2 part by part during the debate** (`RecordingPartStreamer`), so
 *    by the time the debate ends most of it has already left the device and the post-debate
 *    upload is only the tail — seconds rather than minutes on a home connection.
 *
 * The existing single-PUT upload is the fallback for everything: a server without the multipart
 * routes, a start that fails, a streamer that was paused for the whole debate. Nothing here can
 * lose a recording the old path would have kept.
 */

/** A multipart upload in progress, as the client tracks it. */
export type StreamedRecordingMultipart = {
  filename: string;
  uploadId: string;
  partSize: number;
  /** Parts confirmed uploaded. Advisory: the server lists parts itself before completing. */
  uploadedPartNumbers: number[];
};

export type DebateRecordingStream = {
  id: string;
  userId: string;
  debateId: string;
  mimeType: string;
  startedAtMs: number;
  /** Server-clock time of the newest chunk: the recording's end if this tab never stops it. */
  lastChunkAtMs: number;
  /** Local wall-clock time of the newest write, used to tell a live recorder from an orphan. */
  heartbeatAt: number;
  byteSize: number;
  chunkCount: number;
  width: number | null;
  height: number | null;
  framerate: number | null;
  videoBitsPerSecond: number | null;
  multipart: StreamedRecordingMultipart | null;
  createdAt: number;
};

export type DebateRecordingChunk = {
  streamId: string;
  seq: number;
  blob: Blob;
};

export type RecordingStreamMetadata = Pick<
  DebateRecordingStream,
  'userId' | 'debateId' | 'mimeType' | 'startedAtMs' | 'width' | 'height' | 'framerate' | 'videoBitsPerSecond'
>;

/**
 * A stream whose tab has not written for this long is treated as orphaned. A live recorder writes
 * every second, so this only has to outlast a backgrounded tab's throttled timers.
 */
export const RECORDING_STREAM_ORPHAN_AFTER_MS = 2 * 60_000;

export async function createRecordingStream(id: string, metadata: RecordingStreamMetadata): Promise<void> {
  const now = Date.now();
  await db.debateRecordingStreams.put({
    id,
    ...metadata,
    lastChunkAtMs: metadata.startedAtMs,
    heartbeatAt: now,
    byteSize: 0,
    chunkCount: 0,
    multipart: null,
    createdAt: now,
  });
}

export async function appendRecordingChunk(
  streamId: string,
  seq: number,
  blob: Blob,
  chunkAtMs: number
): Promise<void> {
  await db.transaction('rw', db.debateRecordingStreams, db.debateRecordingChunks, async () => {
    const stream = await db.debateRecordingStreams.get(streamId);
    if (!stream) return;
    await db.debateRecordingChunks.put({ streamId, seq, blob });
    await db.debateRecordingStreams.update(streamId, {
      byteSize: stream.byteSize + blob.size,
      chunkCount: Math.max(stream.chunkCount, seq + 1),
      lastChunkAtMs: Math.max(stream.lastChunkAtMs, chunkAtMs),
      heartbeatAt: Date.now(),
    });
  });
}

export async function setRecordingStreamMultipart(
  streamId: string,
  multipart: StreamedRecordingMultipart | null
): Promise<void> {
  await db.debateRecordingStreams.update(streamId, { multipart });
}

export async function getRecordingStream(streamId: string): Promise<DebateRecordingStream | undefined> {
  return db.debateRecordingStreams.get(streamId);
}

export async function listRecordingStreams(userId: string): Promise<DebateRecordingStream[]> {
  return db.debateRecordingStreams.where('userId').equals(userId).toArray();
}

/** The stream's chunks, in recording order, as one blob. */
export async function readRecordingStreamBlob(stream: DebateRecordingStream): Promise<Blob> {
  const chunks = await db.debateRecordingChunks.where('streamId').equals(stream.id).sortBy('seq');
  return new Blob(
    chunks.map(chunk => chunk.blob),
    { type: stream.mimeType }
  );
}

export async function deleteRecordingStream(streamId: string): Promise<void> {
  await db.transaction('rw', db.debateRecordingStreams, db.debateRecordingChunks, async () => {
    await db.debateRecordingChunks.where('streamId').equals(streamId).delete();
    await db.debateRecordingStreams.delete(streamId);
  });
}

export function isRecordingStreamOrphaned(stream: DebateRecordingStream, now = Date.now()): boolean {
  return now - stream.heartbeatAt >= RECORDING_STREAM_ORPHAN_AFTER_MS;
}

/** Number of whole parts in `byteSize` bytes, and the byte range each covers. */
export function partRange(partNumber: number, partSize: number, byteSize: number): { start: number; end: number } {
  const start = (partNumber - 1) * partSize;
  return { start, end: Math.min(byteSize, start + partSize) };
}

export function totalPartCount(byteSize: number, partSize: number): number {
  return Math.max(1, Math.ceil(byteSize / partSize));
}

export type RecordingPartTransport = {
  startMultipart: () => Promise<{ filename: string; upload_id: string; part_size: number }>;
  getPartUrls: (filename: string, uploadId: string, partNumbers: number[]) => Promise<LocalRecordingPartUrl[]>;
  putPart: (upload: ObjectStoreUpload, body: Blob) => Promise<void>;
  abortMultipart: (filename: string, uploadId: string) => Promise<void>;
};

export type RecordingPartStreamerOptions = RecordingPartTransport & {
  /**
   * Called before every part. The upload shares the participant's upstream with the live call,
   * so it yields whenever the call is struggling — the bytes are safe in IndexedDB and go out
   * after the debate instead, which is exactly what happened before streaming existed.
   */
  shouldPause: () => boolean;
  /** Persists progress so a reload knows which parts already landed. */
  onMultipartChange?: (multipart: StreamedRecordingMultipart) => void;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  /** How long `finish` waits for a part already on the wire before handing over. */
  finishGraceMs?: number;
};

const PART_URL_BATCH = 8;
const PAUSE_RECHECK_MS = 3_000;
const MIN_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;
const MAX_START_ATTEMPTS = 3;

/**
 * Uploads a growing recording to R2 one fixed-size part at a time, while it is recorded.
 *
 * R2 requires every part but the last to be exactly `part_size` bytes, so parts are cut on those
 * byte boundaries of the concatenated timeslices rather than one per timeslice. Only whole parts
 * go out during the debate; the short tail waits for {@link uploadRemainingParts} after the
 * recorder stops. One request is in flight at a time, deliberately: this is competing with the
 * live call for the same upstream.
 */
export class RecordingPartStreamer {
  private readonly options: Required<Pick<RecordingPartStreamerOptions, 'setTimer' | 'clearTimer' | 'finishGraceMs'>> &
    RecordingPartStreamerOptions;
  private readonly chunks: Blob[] = [];
  private byteSize = 0;
  private multipart: StreamedRecordingMultipart | null = null;
  private readonly uploaded = new Set<number>();
  private urls = new Map<number, ObjectStoreUpload>();
  private inFlight: Promise<void> | null = null;
  private timer: unknown = null;
  private startAttempts = 0;
  private failures = 0;
  private disabled = false;
  private stopped = false;
  private pausedMs = 0;
  private partFailures = 0;

  constructor(options: RecordingPartStreamerOptions) {
    this.options = {
      setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
      finishGraceMs: 10_000,
      ...options,
    };
  }

  /** Seeds a streamer resumed from IndexedDB with the parts an earlier run already sent. */
  resume(multipart: StreamedRecordingMultipart): void {
    this.multipart = { ...multipart, uploadedPartNumbers: [...multipart.uploadedPartNumbers] };
    for (const partNumber of multipart.uploadedPartNumbers) this.uploaded.add(partNumber);
  }

  append(chunk: Blob): void {
    if (this.stopped || chunk.size === 0) return;
    this.chunks.push(chunk);
    this.byteSize += chunk.size;
    this.schedule(0);
  }

  /**
   * Stops sending and hands the upload's state to whoever uploads the tail. Waits briefly for a
   * part already on the wire so its number is recorded, but never for more parts.
   */
  async finish(): Promise<StreamedRecordingMultipart | null> {
    this.stopped = true;
    this.clearScheduled();
    if (this.inFlight) {
      await Promise.race([
        this.inFlight.catch(() => undefined),
        new Promise<void>(resolve => this.options.setTimer(resolve, this.options.finishGraceMs)),
      ]);
    }
    return this.snapshot();
  }

  /** Stops sending and discards everything already sent. For a recording that must not publish. */
  async abort(): Promise<void> {
    this.stopped = true;
    this.clearScheduled();
    await this.inFlight?.catch(() => undefined);
    const multipart = this.multipart;
    this.multipart = null;
    if (multipart) {
      await this.options.abortMultipart(multipart.filename, multipart.uploadId).catch(() => undefined);
    }
  }

  /** How this recording's live upload went, for the one summary event it reports. */
  stats() {
    const partSize = this.multipart?.partSize ?? null;
    return {
      streaming: this.multipart ? 'on' : this.disabled ? 'unavailable' : 'never_started',
      bytes_recorded: this.byteSize,
      parts_uploaded_live: this.uploaded.size,
      total_parts: partSize ? totalPartCount(this.byteSize, partSize) : null,
      paused_ms: this.pausedMs,
      part_failures: this.partFailures,
    } as const;
  }

  snapshot(): StreamedRecordingMultipart | null {
    if (!this.multipart) return null;
    return { ...this.multipart, uploadedPartNumbers: [...this.uploaded].sort((a, b) => a - b) };
  }

  private schedule(delayMs: number) {
    if (this.stopped || this.disabled || this.timer !== null || this.inFlight) return;
    this.timer = this.options.setTimer(() => {
      this.timer = null;
      void this.pump();
    }, delayMs);
  }

  private clearScheduled() {
    if (this.timer !== null) {
      this.options.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private nextPartNumber(): number | null {
    if (!this.multipart) return null;
    const wholeParts = Math.floor(this.byteSize / this.multipart.partSize);
    for (let partNumber = 1; partNumber <= wholeParts; partNumber += 1) {
      if (!this.uploaded.has(partNumber)) return partNumber;
    }
    return null;
  }

  private async pump(): Promise<void> {
    if (this.stopped || this.disabled || this.inFlight) return;
    if (this.options.shouldPause()) {
      this.pausedMs += PAUSE_RECHECK_MS;
      this.schedule(PAUSE_RECHECK_MS);
      return;
    }
    const step = this.multipart ? this.sendNextPart() : this.start();
    this.inFlight = step;
    try {
      await step;
      this.failures = 0;
    } catch (error) {
      this.failures += 1;
      if (this.multipart) this.partFailures += 1;
      if (!this.multipart && isMissingRouteError(error)) {
        // A geo-chat without the multipart routes. The recording still uploads after the debate,
        // as one PUT, exactly as it did before.
        this.disabled = true;
        return;
      }
      if (!this.multipart && this.startAttempts >= MAX_START_ATTEMPTS) {
        this.disabled = true;
        return;
      }
      this.inFlight = null;
      this.schedule(Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** (this.failures - 1)));
      return;
    } finally {
      if (this.inFlight === step) this.inFlight = null;
    }
    this.schedule(0);
  }

  private async start(): Promise<void> {
    this.startAttempts += 1;
    const started = await this.options.startMultipart();
    if (this.stopped) {
      // The recorder stopped while the upload was being opened; nothing will use it.
      await this.options.abortMultipart(started.filename, started.upload_id).catch(() => undefined);
      return;
    }
    this.multipart = {
      filename: started.filename,
      uploadId: started.upload_id,
      partSize: started.part_size,
      uploadedPartNumbers: [],
    };
    this.options.onMultipartChange?.(this.snapshot()!);
  }

  private async sendNextPart(): Promise<void> {
    const multipart = this.multipart!;
    const partNumber = this.nextPartNumber();
    if (partNumber === null) return;
    const upload = await this.partUrl(partNumber);
    const { start, end } = partRange(partNumber, multipart.partSize, this.byteSize);
    await this.options.putPart(upload, new Blob(this.chunks).slice(start, end));
    this.uploaded.add(partNumber);
    this.urls.delete(partNumber);
    this.options.onMultipartChange?.(this.snapshot()!);
  }

  private async partUrl(partNumber: number): Promise<ObjectStoreUpload> {
    const cached = this.urls.get(partNumber);
    if (cached && Date.parse(cached.expires_at) - Date.now() > 60_000) return cached;
    const multipart = this.multipart!;
    const wanted = Array.from({ length: PART_URL_BATCH }, (_, index) => partNumber + index).filter(
      candidate => !this.uploaded.has(candidate)
    );
    const parts = await this.options.getPartUrls(multipart.filename, multipart.uploadId, wanted);
    this.urls = new Map(parts.map(part => [part.part_number, part.upload]));
    const upload = this.urls.get(partNumber);
    if (!upload) throw new Error(`No upload URL was returned for recording part ${partNumber}.`);
    return upload;
  }
}

/**
 * Sends every part of a finished recording that has not already landed.
 *
 * Runs after the recorder stops, from the upload queue. The recording is complete by then, so
 * the last part is simply whatever is left over. Parts the live streamer sent are skipped;
 * re-sending one would be harmless — it overwrites itself with the same bytes — just wasteful.
 */
export async function uploadRemainingParts(
  blob: Blob,
  multipart: StreamedRecordingMultipart,
  transport: Pick<RecordingPartTransport, 'getPartUrls' | 'putPart'>,
  onPartUploaded: (partNumber: number, uploadedBytes: number) => Promise<void> | void
): Promise<void> {
  const total = totalPartCount(blob.size, multipart.partSize);
  const uploaded = new Set(multipart.uploadedPartNumbers);
  const missing = Array.from({ length: total }, (_, index) => index + 1).filter(
    partNumber => !uploaded.has(partNumber)
  );
  for (let offset = 0; offset < missing.length; offset += PART_URL_BATCH) {
    const batch = missing.slice(offset, offset + PART_URL_BATCH);
    const urls = new Map(
      (await transport.getPartUrls(multipart.filename, multipart.uploadId, batch)).map(part => [
        part.part_number,
        part.upload,
      ])
    );
    for (const partNumber of batch) {
      const upload = urls.get(partNumber);
      if (!upload) throw new Error(`No upload URL was returned for recording part ${partNumber}.`);
      const { start, end } = partRange(partNumber, multipart.partSize, blob.size);
      await transport.putPart(upload, blob.slice(start, end));
      uploaded.add(partNumber);
      const uploadedBytes = [...uploaded].reduce((sum, number) => {
        const range = partRange(number, multipart.partSize, blob.size);
        return sum + (range.end - range.start);
      }, 0);
      await onPartUploaded(partNumber, uploadedBytes);
    }
  }
}

/** One part of a streamed recording. The signed URL carries everything; no headers are needed. */
export async function putRecordingPart(upload: ObjectStoreUpload, body: Blob): Promise<void> {
  const response = await fetch(upload.url, { method: upload.method, body });
  if (!response.ok) throw new Error(`Recording part upload failed (${response.status})`);
}

/** A 404 with no error code is a route this geo-chat does not have, not a missing debate. */
export function isMissingRouteError(error: unknown): boolean {
  return error instanceof GeoChatRequestError && error.status === 404 && error.code === null;
}

export type LiveRecordingStream = {
  readonly id: string;
  /** Hands one `MediaRecorder` timeslice to IndexedDB and to the part streamer. */
  append: (chunk: Blob, chunkAtMs: number) => void;
  /**
   * The recorder has stopped: waits for every chunk write, stops the streamer, and returns the
   * multipart upload for the queue to finish — or `null` if nothing was streamed.
   */
  finish: () => Promise<StreamedRecordingMultipart | null>;
  /** The recording has been handed to the upload queue, which now holds the only copy it needs. */
  release: () => Promise<void>;
  /** The recording must not publish: discard the streamed parts and the local chunks. */
  abort: () => Promise<void>;
};

/**
 * Everything the debate room needs to make one recording durable while it is made.
 *
 * Failures here are logged and swallowed, never thrown into the recorder: the in-memory chunks
 * the room keeps are still the source of the upload at the end, so a quota error or a dead
 * connection costs the protection this adds, not the recording.
 */
export function startLiveRecordingStream({
  id,
  metadata,
  transport,
  shouldPause,
}: {
  id: string;
  metadata: RecordingStreamMetadata;
  transport: RecordingPartTransport;
  shouldPause: () => boolean;
}): LiveRecordingStream {
  let seq = 0;
  let durable = true;
  let writes: Promise<void> = createRecordingStream(id, metadata).catch(error => {
    durable = false;
    console.warn('[DebateRecording] could not open the local recording store:', error);
  });
  const streamer = new RecordingPartStreamer({
    ...transport,
    shouldPause,
    onMultipartChange: multipart => {
      writes = writes.then(() =>
        setRecordingStreamMultipart(id, multipart).catch(error =>
          console.warn('[DebateRecording] could not save streaming progress:', error)
        )
      );
    },
  });

  return {
    id,
    append(chunk, chunkAtMs) {
      streamer.append(chunk);
      if (!durable) return;
      const chunkSeq = seq;
      seq += 1;
      writes = writes.then(() =>
        appendRecordingChunk(id, chunkSeq, chunk, chunkAtMs).catch(error => {
          // Most likely the storage quota. Stop writing rather than fail every second; the room's
          // in-memory copy still carries the recording to the upload queue at the end.
          durable = false;
          console.warn('[DebateRecording] stopped saving the recording locally as it is made:', error);
        })
      );
    },
    async finish() {
      const multipart = await streamer.finish();
      await writes;
      // One event per recording: whether streaming ran, how much went out live, and how long it
      // stood down for the call. The whole point of GEO-2955 is invisible without it.
      capture('debate_recording_stream_finished', {
        debate_id: metadata.debateId,
        saved_locally: durable,
        ...streamer.stats(),
      });
      return multipart;
    },
    async release() {
      await writes;
      await deleteRecordingStream(id).catch(error =>
        console.warn('[DebateRecording] could not clear the local recording store:', error)
      );
    },
    async abort() {
      await streamer.abort();
      await writes;
      await deleteRecordingStream(id).catch(() => undefined);
    },
  };
}

export type OrphanRecoveryDependencies = {
  getDebate: (debateId: string) => Promise<{
    status: string;
    recording_cancelled_at: string | null;
    recordings: { user_id: string }[];
  }>;
  hasQueuedUpload: (userId: string, debateId: string) => Promise<{ multipartUploadId: string | null } | null>;
  enqueue: (stream: DebateRecordingStream, blob: Blob) => Promise<void>;
  abortMultipart: (debateId: string, filename: string, uploadId: string) => Promise<void>;
  now?: () => number;
};

/** Debate states in which geo-chat accepts a recording's completion. */
const FINALIZABLE_STATUSES = new Set(['thanking', 'complete']);

/**
 * Adopts recordings whose tab died before handing them to the upload queue.
 *
 * Without this the chunks written during the debate would protect nothing: the tab that wrote
 * them is gone, and no other code knows they exist. A stream is only touched once its tab has
 * been silent long enough to be dead ({@link RECORDING_STREAM_ORPHAN_AFTER_MS}), and only
 * recovered when it is the participant's *only* copy — if they rejoined and recorded again, or
 * the recording already reached geo-chat, the orphan is discarded, which is what happened to it
 * before this existed. A debate that is still running is left alone to be looked at again later.
 */
export async function recoverOrphanedRecordingStreams(
  userId: string,
  dependencies: OrphanRecoveryDependencies
): Promise<void> {
  const now = dependencies.now?.() ?? Date.now();
  for (const stream of await listRecordingStreams(userId)) {
    if (!isRecordingStreamOrphaned(stream, now)) continue;
    const discard = async () => {
      if (stream.multipart) {
        await dependencies
          .abortMultipart(stream.debateId, stream.multipart.filename, stream.multipart.uploadId)
          .catch(() => undefined);
      }
      await deleteRecordingStream(stream.id);
    };
    const report = (outcome: string) =>
      capture('debate_recording_orphan', {
        debate_id: stream.debateId,
        outcome,
        bytes: stream.byteSize,
        streamed_parts: stream.multipart?.uploadedPartNumbers.length ?? 0,
      });
    try {
      const queued = await dependencies.hasQueuedUpload(userId, stream.debateId);
      if (queued) {
        // The queue already holds this participant's recording. If it is finishing this very
        // multipart upload, aborting would destroy it; otherwise the orphan's parts are dead weight.
        if (queued.multipartUploadId !== null && queued.multipartUploadId === stream.multipart?.uploadId) {
          await deleteRecordingStream(stream.id);
        } else {
          await discard();
        }
        report('discarded_already_queued');
        continue;
      }
      let debate: Awaited<ReturnType<OrphanRecoveryDependencies['getDebate']>>;
      try {
        debate = await dependencies.getDebate(stream.debateId);
      } catch (error) {
        if (error instanceof GeoChatRequestError && error.status === 404) {
          await discard();
          report('discarded_debate_gone');
        }
        continue;
      }
      if (debate.recording_cancelled_at !== null || debate.status === 'cancelled') {
        await discard();
        report('discarded_cancelled');
        continue;
      }
      if (debate.recordings.some(recording => recording.user_id === userId)) {
        await discard();
        report('discarded_already_uploaded');
        continue;
      }
      if (!FINALIZABLE_STATUSES.has(debate.status)) continue;
      if (stream.byteSize === 0) {
        await discard();
        report('discarded_empty');
        continue;
      }
      await dependencies.enqueue(stream, await readRecordingStreamBlob(stream));
      await deleteRecordingStream(stream.id);
      report('recovered');
    } catch (error) {
      console.warn('[DebateRecording] could not recover an interrupted recording:', error);
    }
  }
}
