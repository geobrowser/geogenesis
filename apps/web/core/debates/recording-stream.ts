import { capture } from '~/core/analytics';
import { db } from '~/core/database/indexeddb';

import { GeoChatRequestError, type LocalRecordingPartUrl, type ObjectStoreUpload } from './api';
import { RecordingUploadError, recordingStorageHttpError } from './recording-upload-errors';

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
  /** The timeslice's bytes. Stored as an `ArrayBuffer`, not a `Blob`, for Safari (GEO-3116). */
  data?: ArrayBuffer;
  /** Chunks written before GEO-3116. */
  blob?: Blob;
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

/** Writes one timeslice. Resolves `false`, writing nothing, when the stream's row is not there. */
export async function appendRecordingChunk(
  streamId: string,
  seq: number,
  blob: Blob,
  chunkAtMs: number
): Promise<boolean> {
  // Read before the transaction opens: it would commit at a non-IndexedDB `await` inside it.
  const data = await blob.arrayBuffer();
  return db.transaction('rw', db.debateRecordingStreams, db.debateRecordingChunks, async () => {
    const stream = await db.debateRecordingStreams.get(streamId);
    if (!stream) return false;
    await db.debateRecordingChunks.put({ streamId, seq, data });
    await db.debateRecordingStreams.update(streamId, {
      byteSize: stream.byteSize + blob.size,
      chunkCount: Math.max(stream.chunkCount, seq + 1),
      lastChunkAtMs: Math.max(stream.lastChunkAtMs, chunkAtMs),
      heartbeatAt: Date.now(),
    });
    return true;
  });
}

/** Some of a stream's timeslices, by `seq`, as the bytes they were saved as. */
export async function readRecordingStreamChunks(streamId: string, seqs: number[]): Promise<Map<number, ArrayBuffer>> {
  const found = new Map<number, ArrayBuffer>();
  if (seqs.length === 0) return found;
  const wanted = new Set(seqs);
  const chunks = await db.debateRecordingChunks
    .where('[streamId+seq]')
    .between([streamId, Math.min(...seqs)], [streamId, Math.max(...seqs)], true, true)
    .toArray();
  for (const chunk of chunks) {
    if (!wanted.has(chunk.seq)) continue;
    const data = chunk.data ?? (chunk.blob ? await chunk.blob.arrayBuffer() : undefined);
    if (data) found.set(chunk.seq, data);
  }
  return found;
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
    chunks.map(chunk => chunk.data ?? chunk.blob ?? new ArrayBuffer(0)),
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

/**
 * A recording's bytes, read a range at a time, so that nothing has to hold the whole of it.
 *
 * Bytes before `availableFrom` are not on this device any more: they went out during the debate in
 * multipart parts that object storage confirmed, and the queue only ever needs the parts that did
 * not. Every byte from `availableFrom` on can be read.
 */
export type RecordingByteSource = {
  readonly size: number;
  readonly availableFrom: number;
  /** Everything from `availableFrom` on is held in memory, so keeping a copy of it costs nothing. */
  readonly heldInMemory: boolean;
  /** Bytes `[start, end)`, as a memory-backed `Blob`. */
  read: (start: number, end: number) => Promise<Blob>;
};

export function blobByteSource(blob: Blob): RecordingByteSource {
  return {
    size: blob.size,
    availableFrom: 0,
    heldInMemory: true,
    read: async (start, end) => blob.slice(start, end),
  };
}

function isBlob(value: Blob | RecordingByteSource): value is Blob {
  return typeof (value as Blob).arrayBuffer === 'function';
}

export function recordingBytesReleasedError(start: number) {
  return new RecordingUploadError(
    `Recording bytes from ${start} were uploaded during the debate and are no longer kept on this device.`,
    'blob_unreadable'
  );
}

/**
 * When the live upload falls behind — it stands down while the call struggles, and it may not be
 * able to start at all — the bytes it has not sent pile up. Past this many held in memory, the
 * oldest ones already saved in IndexedDB are let go and read back from there when they are needed.
 * About three and a half minutes of a 2.5 Mbps recording: well under the five-minute debates that
 * have always been held in memory whole.
 */
export const RECORDING_RETAINED_BYTES_LIMIT = 64 * 1024 * 1024;

type LedgerEntry = {
  seq: number;
  start: number;
  end: number;
  /** The timeslice, while this tab still holds it. */
  blob: Blob | null;
  /** Saved in the stream's IndexedDB chunks, so it can be read back once let go. */
  durable: boolean;
};

export type ReadDurableChunks = (seqs: number[]) => Promise<Map<number, ArrayBuffer>>;

/**
 * The recording's timeslices, in order, holding in memory only what is not safe anywhere else.
 *
 * A timeslice is let go once every byte of it is in a multipart part object storage confirmed
 * (`confirm`), and — only when too much is piling up — once it is saved in IndexedDB (`spill`).
 * One that is neither is always held: nothing is let go that cannot be had back, or that is not
 * already uploaded.
 */
export class RecordingChunkLedger {
  private readonly entries: LedgerEntry[] = [];
  private total = 0;
  private confirmed = 0;
  private retained = 0;
  private peak = 0;
  private spilled = 0;
  /** Entries before this index are let go for good: wholly confirmed. */
  private confirmedCursor = 0;
  private frozen = false;

  get size() {
    return this.total;
  }

  /** Bytes from the start of the recording that are in confirmed parts. */
  get confirmedBytes() {
    return this.confirmed;
  }

  get retainedBytes() {
    return this.retained;
  }

  get peakRetainedBytes() {
    return this.peak;
  }

  get spilledChunks() {
    return this.spilled;
  }

  /** Every byte from `start` on is held in memory. */
  heldFrom(start: number): boolean {
    for (let index = this.indexAt(start); index < this.entries.length; index += 1) {
      if (!this.entries[index].blob) return false;
    }
    return true;
  }

  append(blob: Blob): number {
    const seq = this.entries.length;
    this.entries.push({ seq, start: this.total, end: this.total + blob.size, blob, durable: false });
    this.total += blob.size;
    this.retained += blob.size;
    this.peak = Math.max(this.peak, this.retained);
    this.releaseConfirmed();
    return seq;
  }

  markDurable(seq: number) {
    const entry = this.entries[seq];
    if (entry) entry.durable = true;
  }

  /** The first `bytes` of the recording are in parts object storage confirmed. */
  confirm(bytes: number) {
    if (this.frozen || bytes <= this.confirmed) return;
    this.confirmed = bytes;
    this.releaseConfirmed();
  }

  /** Lets go of the oldest unsent timeslices already in IndexedDB until no more than `limit` is held. */
  spill(limit: number) {
    if (this.frozen) return;
    for (let index = this.confirmedCursor; index < this.entries.length && this.retained > limit; index += 1) {
      const entry = this.entries[index];
      if (!entry.blob || !entry.durable) continue;
      this.drop(entry);
      this.spilled += 1;
    }
  }

  /**
   * Nothing more is let go. Once the recording is handed to the queue, what it was told it can
   * read must stay readable — a part that lands after that changes nothing it relies on.
   */
  freeze() {
    this.frozen = true;
  }

  /** Bytes `[start, end)`: from memory where held, from IndexedDB where spilled. */
  async read(start: number, end: number, readDurable?: ReadDurableChunks): Promise<Blob> {
    if (start < 0 || end > this.total || start > end) {
      throw new RangeError(`Recording range ${start}-${end} is outside 0-${this.total}.`);
    }
    if (start === end) return new Blob([]);
    const covering: LedgerEntry[] = [];
    for (let index = this.indexAt(start); index < this.entries.length; index += 1) {
      const entry = this.entries[index];
      if (entry.start >= end) break;
      covering.push(entry);
    }
    // Taken now: an entry let go while IndexedDB is read is still in hand.
    const held = covering.map(entry => entry.blob);
    const missing = covering.filter((entry, index) => !held[index]);
    for (const entry of missing) {
      if (!entry.durable || !readDurable) throw recordingBytesReleasedError(entry.start);
    }
    const fetched = missing.length > 0 && readDurable ? await readDurable(missing.map(entry => entry.seq)) : null;
    const parts = covering.map((entry, index) => {
      const part = held[index] ?? fetched?.get(entry.seq);
      const size = part instanceof Blob ? part.size : part?.byteLength;
      if (!part || size !== entry.end - entry.start) {
        throw new RecordingUploadError('This browser’s saved copy of the recording is incomplete.', 'blob_unreadable');
      }
      return part;
    });
    const base = covering[0].start;
    return new Blob(parts).slice(start - base, end - base);
  }

  private releaseConfirmed() {
    while (this.confirmedCursor < this.entries.length && this.entries[this.confirmedCursor].end <= this.confirmed) {
      this.drop(this.entries[this.confirmedCursor]);
      this.confirmedCursor += 1;
    }
  }

  private drop(entry: LedgerEntry) {
    if (!entry.blob) return;
    this.retained -= entry.blob.size;
    entry.blob = null;
  }

  /** The index of the entry holding byte `offset`, or the end. */
  private indexAt(offset: number): number {
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.entries[middle].end <= offset) low = middle + 1;
      else high = middle;
    }
    return low;
  }
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
  /**
   * Where the recording's bytes are kept. Shared with whoever saves them, so that a timeslice this
   * streamer has sent is let go of everywhere. One of its own when omitted.
   */
  ledger?: RecordingChunkLedger;
  /** Reads back timeslices the ledger let go of after saving them to IndexedDB. */
  readDurable?: ReadDurableChunks;
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
  private readonly ledger: RecordingChunkLedger;
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
    this.ledger = options.ledger ?? new RecordingChunkLedger();
  }

  private get byteSize() {
    return this.ledger.size;
  }

  /** Seeds a streamer resumed from IndexedDB with the parts an earlier run already sent. */
  resume(multipart: StreamedRecordingMultipart): void {
    this.multipart = { ...multipart, uploadedPartNumbers: [...multipart.uploadedPartNumbers] };
    for (const partNumber of multipart.uploadedPartNumbers) this.uploaded.add(partNumber);
    this.ledger.confirm(this.confirmedBytes());
  }

  append(chunk: Blob): void {
    if (this.stopped || chunk.size === 0) return;
    this.ledger.append(chunk);
    this.schedule(0);
  }

  /** New bytes are in the shared ledger: send any part they complete. */
  wake(): void {
    this.schedule(0);
  }

  /**
   * Bytes from the start of the recording that are in parts object storage has confirmed: the
   * longest unbroken run of uploaded parts from part 1. Only these are ever let go of.
   */
  confirmedBytes(): number {
    if (!this.multipart) return 0;
    let parts = 0;
    while (this.uploaded.has(parts + 1)) parts += 1;
    return Math.min(this.byteSize, parts * this.multipart.partSize);
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
    // With the snapshot, in the same turn: the bytes it says are uploaded are exactly the ones let
    // go of, even if the part still on the wire lands later.
    this.ledger.freeze();
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
      peak_retained_bytes: this.ledger.peakRetainedBytes,
      spilled_chunks: this.ledger.spilledChunks,
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
    // Only while a whole part is waiting; otherwise the next `append` schedules the pump.
    if (this.nextPartNumber() !== null) this.schedule(0);
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
    await this.options.putPart(upload, await this.ledger.read(start, end, this.options.readDurable));
    this.uploaded.add(partNumber);
    this.urls.delete(partNumber);
    // Its bytes are safe in object storage now, so this tab need not hold them.
    this.ledger.confirm(this.confirmedBytes());
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
    if (!upload) {
      throw new RecordingUploadError(
        `No upload URL was returned for recording part ${partNumber}.`,
        'part_url_missing'
      );
    }
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
  recording: Blob | RecordingByteSource,
  multipart: StreamedRecordingMultipart,
  transport: Pick<RecordingPartTransport, 'getPartUrls' | 'putPart'>,
  onPartUploaded: (partNumber: number, uploadedBytes: number) => Promise<void> | void
): Promise<void> {
  // Read a part at a time: a recording streamed during the debate is never held whole.
  const bytes = isBlob(recording) ? blobByteSource(recording) : recording;
  const blob = { size: bytes.size };
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
      if (!upload) {
        throw new RecordingUploadError(
          `No upload URL was returned for recording part ${partNumber}.`,
          'part_url_missing'
        );
      }
      const { start, end } = partRange(partNumber, multipart.partSize, blob.size);
      await transport.putPart(upload, await bytes.read(start, end));
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
  if (!response.ok) {
    throw recordingStorageHttpError(`Recording part upload failed (${response.status})`, response.status);
  }
}

/** A 404 with no error code is a route this geo-chat does not have, not a missing debate. */
export function isMissingRouteError(error: unknown): boolean {
  return error instanceof GeoChatRequestError && error.status === 404 && error.code === null;
}

export type LiveRecordingStream = {
  readonly id: string;
  /** Hands one `MediaRecorder` timeslice to IndexedDB and to the part streamer. */
  append: (chunk: Blob, chunkAtMs: number) => void;
  /** Bytes recorded so far. */
  size: () => number;
  /**
   * The recorder has stopped: waits for every chunk write, stops the streamer, and returns the
   * multipart upload for the queue to finish — or `null` if nothing was streamed.
   */
  finish: () => Promise<StreamedRecordingMultipart | null>;
  /**
   * The recording's bytes, for the upload queue, once `finish` has resolved. Everything from
   * `availableFrom` on — the bytes no confirmed part holds — is read from memory, or from
   * IndexedDB where it was let go of there. Readable until `release` or `abort`.
   */
  recording: () => RecordingByteSource;
  /** The recording has been handed to the upload queue, which now holds the only copy it needs. */
  release: () => Promise<void>;
  /** The recording must not publish: discard the streamed parts and the local chunks. */
  abort: () => Promise<void>;
  /**
   * The room let go of a recording it could not finish: stop streaming, but keep the local chunks
   * and the multipart upload for orphan recovery. Reports nothing; the recording didn't finish here.
   */
  detach: () => Promise<void>;
};

/**
 * Everything the debate room needs to make one recording durable while it is made — and the
 * only place its bytes are kept while it is made.
 *
 * Memory stays bounded however long the debate runs. A timeslice is held until the part holding
 * it is confirmed by object storage, then let go of: with the live upload keeping up, that is
 * about one part plus the timeslice being cut. When the upload falls behind or never starts,
 * timeslices already saved to IndexedDB are let go of past {@link RECORDING_RETAINED_BYTES_LIMIT}
 * and read back when needed; one that is neither uploaded nor saved is always held, which is
 * what every timeslice was before. See {@link RecordingChunkLedger}.
 *
 * Failures here are logged and swallowed, never thrown into the recorder: a quota error or a
 * dead connection costs the protection this adds, not the recording.
 */
export function startLiveRecordingStream({
  id,
  metadata,
  transport,
  shouldPause,
  retainedBytesLimit = RECORDING_RETAINED_BYTES_LIMIT,
}: {
  id: string;
  metadata: RecordingStreamMetadata;
  transport: RecordingPartTransport;
  shouldPause: () => boolean;
  /** For tests. */
  retainedBytesLimit?: number;
}): LiveRecordingStream {
  let durable = true;
  let writes: Promise<void> = createRecordingStream(id, metadata).catch(error => {
    durable = false;
    console.warn('[DebateRecording] could not open the local recording store:', error);
  });
  const ledger = new RecordingChunkLedger();
  const readDurable: ReadDurableChunks = seqs => readRecordingStreamChunks(id, seqs);
  const streamer = new RecordingPartStreamer({
    ...transport,
    shouldPause,
    ledger,
    readDurable,
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
      if (chunk.size === 0) return;
      const chunkSeq = ledger.append(chunk);
      streamer.wake();
      if (!durable) return;
      writes = writes.then(() =>
        appendRecordingChunk(id, chunkSeq, chunk, chunkAtMs)
          .then(written => {
            if (!written) {
              durable = false;
              return;
            }
            ledger.markDurable(chunkSeq);
            ledger.spill(retainedBytesLimit);
          })
          .catch(error => {
            // Most likely the storage quota. Stop writing rather than fail every second; the
            // timeslices not yet saved stay in memory and carry the recording to the queue.
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
    size: () => ledger.size,
    recording() {
      const availableFrom = ledger.confirmedBytes;
      return {
        size: ledger.size,
        availableFrom,
        heldInMemory: ledger.heldFrom(availableFrom),
        read: async (start, end) => {
          if (start < availableFrom) throw recordingBytesReleasedError(start);
          return ledger.read(start, end, readDurable);
        },
      };
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
    async detach() {
      // Stops the timer, and records a part already on the wire so recovery knows it landed.
      await streamer.finish();
      await writes;
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
