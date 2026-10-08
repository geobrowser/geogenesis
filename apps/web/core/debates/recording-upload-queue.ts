import { liveQuery } from 'dexie';

import { capture } from '~/core/analytics';
import { db } from '~/core/database/indexeddb';

import {
  type RecordingByteSource,
  type StreamedRecordingMultipart,
  blobByteSource,
  recordingBytesReleasedError,
} from './recording-stream';
import { RecordingUploadError, recordingUploadErrorProperties } from './recording-upload-errors';

export type DebateRecordingUploadStage = 'queued' | 'uploaded';

/**
 * Why an upload stopped for good, on `debate_recording_upload_failed`. `rejected`,
 * `retries_exhausted` and `blob_unreadable` are this device failing to deliver a recording;
 * `opponent_cancelled` is a cancellation, and a failure rate excludes it.
 */
export type RecordingUploadTerminalReason = 'rejected' | 'retries_exhausted' | 'blob_unreadable' | 'opponent_cancelled';

/**
 * Where a queued recording's bytes are kept (GEO-3116).
 *
 * - `chunks`: `debateRecordingUploadChunks`, as `ArrayBuffer`s. What every new row uses.
 * - `memory`: nowhere durable. IndexedDB would not take the bytes, so only the tab that recorded
 *   the debate holds them, and the upload has to finish before that tab closes.
 *
 * Rows written before GEO-3116 have neither, and carry the recording inline as `blob`.
 */
export type DebateRecordingUploadStorage = 'chunks' | 'memory';

/** One slice of a queued recording's bytes. */
export type DebateRecordingUploadChunk = {
  uploadId: string;
  seq: number;
  data: ArrayBuffer;
};

/**
 * The size of each stored slice. The same as an R2 multipart part, though nothing depends on that:
 * small enough that no one IndexedDB value is large, few enough that a five-minute debate is ~18.
 */
export const RECORDING_UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;

export type DebateRecordingUpload = {
  id: string;
  userId: string;
  debateId: string;
  /**
   * The recording itself, on rows written before GEO-3116 only. Never written now: Safari could not
   * reliably keep a ~90 MB `Blob` here, and because every `update` of the row put the `Blob` back,
   * one bad copy failed every write to the row as well as every upload of it.
   */
  blob?: Blob;
  /** Where the bytes are; absent on rows that carry `blob`. See {@link DebateRecordingUploadStorage}. */
  storage?: DebateRecordingUploadStorage;
  mimeType: string;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
  byteSize: number;
  width: number | null;
  height: number | null;
  framerate: number | null;
  videoBitsPerSecond: number | null;
  stage: DebateRecordingUploadStage;
  filename: string | null;
  /**
   * The multipart upload the recording was streamed into during the debate, when there was one
   * (GEO-2955). The queue then sends only the parts that did not make it out live. Absent on rows
   * written before streaming existed, which upload as one PUT exactly as before.
   */
  multipart?: StreamedRecordingMultipart | null;
  /**
   * The first byte this device keeps. Everything before it went out during the debate in parts
   * object storage confirmed, so only the rest is stored — however long the debate ran, the queue
   * holds the tail the live upload had not sent, not the recording. Absent (0) on every row whose
   * recording is held whole, which is every row not streamed during the debate.
   */
  localFromByte?: number;
  attemptCount: number;
  nextAttemptAt: number;
  lastError: string | null;
  /**
   * When automatic retries stopped for good (GEO-3116). The row is kept, bytes and all, so the
   * person can see it did not upload and try again; it is not attempted until they do.
   */
  failedAt?: number | null;
  failedReason?: RecordingUploadTerminalReason | null;
  /** When the current run of automatic retries began: `createdAt`, until a manual retry. */
  retriesStartedAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

export function isDebateRecordingUploadFailed(upload: Pick<DebateRecordingUpload, 'failedAt'>): boolean {
  return typeof upload.failedAt === 'number';
}

export type EnqueueDebateRecordingUpload = {
  userId: string;
  debateId: string;
  mimeType: string;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
  width?: number | null;
  height?: number | null;
  framerate?: number | null;
  videoBitsPerSecond?: number | null;
  multipart?: StreamedRecordingMultipart | null;
} & (
  | { blob: Blob; recording?: never }
  /**
   * A recording streamed during the debate, read a range at a time. Only the bytes from its
   * `availableFrom` are stored; the parts before it are in `multipart`, confirmed.
   */
  | { recording: RecordingByteSource; blob?: never }
);

/**
 * Puts a finished recording in the upload queue.
 *
 * The bytes go into `debateRecordingUploadChunks` as `ArrayBuffer`s, written one slice at a time and
 * read back before the row that points at them is written, so a row marked `chunks` always has every
 * byte behind it. When IndexedDB will not take them — Safari has failed on exactly this, with
 * `UnknownError: Error preparing Blob/File data to be stored in object store` (GEO-3116) — the row
 * is written alone, marked `memory`, and this tab's copy carries the upload.
 *
 * Either way the tab that recorded the debate keeps its own copy until the upload finishes, and
 * uploads from that: it is the one copy that is certainly readable.
 *
 * Throws only when not even the row could be written, which leaves nothing for the queue to find.
 */
export async function enqueueDebateRecordingUpload(
  input: EnqueueDebateRecordingUpload
): Promise<DebateRecordingUpload> {
  const id = debateRecordingUploadId(input.userId, input.debateId);

  const existing = await db.debateRecordingUploads.get(id);
  if (existing) return existing;

  const bytes = input.recording ?? blobByteSource(input.blob);
  const localFromByte = bytes.availableFrom;
  const now = Date.now();
  const upload: DebateRecordingUpload = {
    id,
    userId: input.userId,
    debateId: input.debateId,
    storage: 'chunks',
    mimeType: input.mimeType,
    startedAtMs: input.startedAtMs,
    endedAtMs: input.endedAtMs,
    durationSeconds: input.durationSeconds,
    byteSize: bytes.size,
    ...(localFromByte > 0 ? { localFromByte } : {}),
    width: input.width ?? null,
    height: input.height ?? null,
    framerate: input.framerate ?? null,
    videoBitsPerSecond: input.videoBitsPerSecond ?? null,
    stage: 'queued',
    filename: null,
    multipart: input.multipart ?? null,
    attemptCount: 0,
    nextAttemptAt: now,
    lastError: null,
    failedAt: null,
    failedReason: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await writeRecordingChunks(id, bytes);
    await verifyRecordingChunks(id, bytes.size - localFromByte);
    const stored = await db.transaction('rw', db.debateRecordingUploads, async () => {
      const raced = await db.debateRecordingUploads.get(id);
      if (raced) return raced;
      await db.debateRecordingUploads.add(upload);
      return upload;
    });
    if (stored === upload) {
      if (input.blob) keepRecordingInMemory(id, input.blob);
      // Bytes already in memory cost nothing more to keep. Ones read back from IndexedDB would.
      else if (bytes.heldInMemory)
        keepRecordingInMemory(id, await bytes.read(localFromByte, bytes.size), localFromByte);
    }
    return stored;
  } catch (error) {
    const memoryOnly: DebateRecordingUpload = { ...upload, storage: 'memory' };
    let held: Blob;
    try {
      held = input.blob ?? (await bytes.read(localFromByte, bytes.size));
    } catch {
      throw error;
    }
    try {
      await db.transaction('rw', db.debateRecordingUploads, db.debateRecordingUploadChunks, async () => {
        await db.debateRecordingUploadChunks.where('uploadId').equals(id).delete();
        const raced = await db.debateRecordingUploads.get(id);
        if (!raced) await db.debateRecordingUploads.add(memoryOnly);
      });
    } catch {
      // Nothing durable could be written at all. The caller reports the original failure (the
      // storage-quota message among them), exactly as before.
      throw error;
    }
    keepRecordingInMemory(id, held, localFromByte);
    console.warn('[DebateRecording] could not save the recording locally; uploading from this tab:', error);
    capture('debate_recording_upload_fallback', {
      debate_id: input.debateId,
      reason: 'saved_in_memory_only',
      bytes: held.size,
      ...recordingUploadErrorProperties(error, { online: typeof navigator === 'undefined' || navigator.onLine }),
    });
    return (await db.debateRecordingUploads.get(id)) ?? memoryOnly;
  }
}

/**
 * Writes the recording one slice at a time, so no more than one slice is held twice in memory.
 * Any slices left by an earlier attempt that died partway are cleared first. Slice 0 starts at the
 * source's `availableFrom`: the row's `localFromByte`.
 */
async function writeRecordingChunks(uploadId: string, bytes: RecordingByteSource): Promise<void> {
  await db.debateRecordingUploadChunks.where('uploadId').equals(uploadId).delete();
  const from = bytes.availableFrom;
  for (let seq = 0; from + seq * RECORDING_UPLOAD_CHUNK_BYTES < bytes.size; seq += 1) {
    const start = from + seq * RECORDING_UPLOAD_CHUNK_BYTES;
    // Read before the write, never inside a transaction: an IndexedDB transaction commits at the
    // first `await` that is not an IndexedDB request.
    const slice = await bytes.read(start, Math.min(bytes.size, start + RECORDING_UPLOAD_CHUNK_BYTES));
    const data = await slice.arrayBuffer();
    await db.debateRecordingUploadChunks.put({ uploadId, seq, data });
  }
}

/** Reads every slice back and checks the bytes add up. A write that "succeeded" is not enough. */
async function verifyRecordingChunks(uploadId: string, byteSize: number): Promise<void> {
  let total = 0;
  let expectedSeq = 0;
  await db.debateRecordingUploadChunks
    .where('uploadId')
    .equals(uploadId)
    .each(chunk => {
      if (chunk.seq !== expectedSeq) total = Number.NaN;
      expectedSeq += 1;
      total += chunk.data.byteLength;
    });
  if (total !== byteSize) {
    throw new RecordingUploadError('The saved copy of the recording did not read back whole.', 'blob_unreadable');
  }
}

/**
 * The recording a queue row points at, as a `Blob` held in memory.
 *
 * Always memory-backed. A `Blob` read out of IndexedDB is a reference to a file the browser keeps,
 * and in Safari a request body made from one failed with `TypeError: Load failed` for hours while
 * nothing else was wrong (GEO-3116). Reading the bytes out first also means a copy that cannot be
 * read fails here, as `blob_unreadable`, rather than looking like the network.
 *
 * A row from before GEO-3116 is moved onto the new storage the first time it reads cleanly.
 */
export async function readDebateRecordingUploadBlob(upload: DebateRecordingUpload): Promise<Blob> {
  const inMemory = inMemoryRecordings.get(upload.id);
  if (inMemory && inMemory.from === 0) return inMemory.blob;
  // Only the tail is on this device; the rest is in the parts streamed during the debate.
  if ((upload.localFromByte ?? 0) > 0) throw recordingBytesReleasedError(0);

  if (upload.storage === 'chunks') {
    const chunks = await db.debateRecordingUploadChunks.where('uploadId').equals(upload.id).sortBy('seq');
    const contiguous = chunks.every((chunk, index) => chunk.seq === index);
    const total = chunks.reduce((sum, chunk) => sum + chunk.data.byteLength, 0);
    if (!contiguous || total !== upload.byteSize) {
      throw new RecordingUploadError('This browser’s saved copy of the recording is incomplete.', 'blob_unreadable');
    }
    return new Blob(
      chunks.map(chunk => chunk.data),
      { type: upload.mimeType }
    );
  }

  if (upload.blob) {
    let bytes: ArrayBuffer;
    try {
      bytes = await upload.blob.arrayBuffer();
    } catch (error) {
      console.warn('[DebateRecording] the saved recording could not be read:', error);
      throw new RecordingUploadError(
        'This browser can no longer read its saved copy of the recording.',
        'blob_unreadable'
      );
    }
    const blob = new Blob([bytes], { type: upload.mimeType });
    keepRecordingInMemory(upload.id, blob);
    await migrateLegacyRecording(upload.id, blob).catch(error =>
      console.warn('[DebateRecording] could not move a saved recording to the new storage:', error)
    );
    return blob;
  }

  // `memory`, and the tab that held it is gone.
  throw new RecordingUploadError('This browser no longer has a copy of the recording.', 'blob_unreadable');
}

/**
 * The recording a queue row points at, read a range at a time (GEO-2955). What a streamed upload
 * sends from: only the parts that did not go out live are read, one at a time, so finishing the
 * upload never holds the whole recording — or, for a row that keeps only the tail, could not.
 *
 * Prefers this tab's own copy where it covers the range, as {@link readDebateRecordingUploadBlob}
 * does, and checks a stored copy adds up before anything is read from it.
 */
export async function readDebateRecordingUploadBytes(upload: DebateRecordingUpload): Promise<RecordingByteSource> {
  const localFrom = upload.localFromByte ?? 0;
  const inMemory = inMemoryRecordings.get(upload.id);
  if (inMemory && inMemory.from <= localFrom) {
    return memoryByteSource(upload.byteSize, inMemory);
  }
  if (upload.storage === 'chunks') {
    await verifyStoredRecording(upload.id, upload.byteSize - localFrom);
    return {
      size: upload.byteSize,
      availableFrom: localFrom,
      heldInMemory: false,
      read: async (start, end) => {
        if (inMemory && start >= inMemory.from) return inMemory.blob.slice(start - inMemory.from, end - inMemory.from);
        if (start < localFrom) throw recordingBytesReleasedError(start);
        return readStoredRecordingRange(upload, start - localFrom, end - localFrom);
      },
    };
  }
  if (localFrom > 0) {
    throw new RecordingUploadError('This browser no longer has a copy of the recording.', 'blob_unreadable');
  }
  return blobByteSource(await readDebateRecordingUploadBlob(upload));
}

function memoryByteSource(size: number, inMemory: InMemoryRecording): RecordingByteSource {
  return {
    size,
    availableFrom: inMemory.from,
    heldInMemory: true,
    read: async (start, end) => {
      if (start < inMemory.from) throw recordingBytesReleasedError(start);
      return inMemory.blob.slice(start - inMemory.from, end - inMemory.from);
    },
  };
}

/** Like {@link verifyRecordingChunks}, with the message a reader of the copy shows. */
async function verifyStoredRecording(uploadId: string, storedBytes: number): Promise<void> {
  try {
    await verifyRecordingChunks(uploadId, storedBytes);
  } catch (error) {
    if (error instanceof RecordingUploadError) {
      throw new RecordingUploadError('This browser’s saved copy of the recording is incomplete.', 'blob_unreadable');
    }
    throw error;
  }
}

/** Stored bytes `[start, end)`, counted from the row's `localFromByte`: only the slices they span. */
async function readStoredRecordingRange(upload: DebateRecordingUpload, start: number, end: number): Promise<Blob> {
  if (start >= end) return new Blob([], { type: upload.mimeType });
  const firstSeq = Math.floor(start / RECORDING_UPLOAD_CHUNK_BYTES);
  const lastSeq = Math.floor((end - 1) / RECORDING_UPLOAD_CHUNK_BYTES);
  const chunks = await db.debateRecordingUploadChunks
    .where('[uploadId+seq]')
    .between([upload.id, firstSeq], [upload.id, lastSeq], true, true)
    .toArray();
  chunks.sort((a, b) => a.seq - b.seq);
  if (chunks.length !== lastSeq - firstSeq + 1 || chunks.some((chunk, index) => chunk.seq !== firstSeq + index)) {
    throw new RecordingUploadError('This browser’s saved copy of the recording is incomplete.', 'blob_unreadable');
  }
  const base = firstSeq * RECORDING_UPLOAD_CHUNK_BYTES;
  return new Blob(
    chunks.map(chunk => chunk.data),
    { type: upload.mimeType }
  ).slice(start - base, end - base);
}

/** Rewrites a pre-GEO-3116 row as chunks, dropping its inline `Blob`. Best effort. */
async function migrateLegacyRecording(id: string, blob: Blob): Promise<void> {
  await writeRecordingChunks(id, blobByteSource(blob));
  await verifyRecordingChunks(id, blob.size);
  await db.transaction('rw', db.debateRecordingUploads, async () => {
    const row = await db.debateRecordingUploads.get(id);
    if (!row) return;
    const { blob: _legacyBlob, ...rest } = row;
    await db.debateRecordingUploads.put({ ...rest, storage: 'chunks', updatedAt: Date.now() });
  });
}

/**
 * This tab's own copies of the recordings it queued, by upload id, until each upload finishes.
 * Deliberately module state: it must outlive the debate room, which unmounts long before the upload
 * coordinator is done, and must not outlive the tab.
 */
const inMemoryRecordings = new Map<string, InMemoryRecording>();

/** A copy of a recording's bytes from `from` to the end. `from` is 0 unless the row keeps only its tail. */
type InMemoryRecording = { from: number; blob: Blob };

function keepRecordingInMemory(id: string, blob: Blob, from = 0) {
  inMemoryRecordings.set(id, { from, blob });
}

/** For tests: forget every copy this tab holds, as a reload would. */
export function forgetInMemoryRecordingsForTest() {
  inMemoryRecordings.clear();
}

export function observeDebateRecordingUploads(userId: string) {
  return liveQuery(() => listDebateRecordingUploads(userId));
}

export async function listDebateRecordingUploads(userId: string): Promise<DebateRecordingUpload[]> {
  return db.debateRecordingUploads.where('userId').equals(userId).sortBy('createdAt');
}

export async function getDebateRecordingUpload(id: string): Promise<DebateRecordingUpload | undefined> {
  return db.debateRecordingUploads.get(id);
}

export async function markDebateRecordingUploaded(id: string, filename: string): Promise<void> {
  await db.debateRecordingUploads.update(id, {
    stage: 'uploaded',
    filename,
    attemptCount: 0,
    nextAttemptAt: Date.now(),
    lastError: null,
    updatedAt: Date.now(),
  });
}

/**
 * Sends the recording back to the start of its upload: every part is sent again on the next
 * attempt. For when the server says parts the client believed uploaded are not there.
 */
export async function requeueDebateRecordingParts(id: string): Promise<void> {
  await db.transaction('rw', db.debateRecordingUploads, async () => {
    const upload = await db.debateRecordingUploads.get(id);
    if (!upload) return;
    const multipart = upload.multipart;
    // Parts whose bytes this device no longer keeps cannot be sent again; resending the rest is
    // all a retry can do.
    const kept = upload.localFromByte ?? 0;
    await db.debateRecordingUploads.update(id, {
      stage: 'queued',
      filename: null,
      multipart: multipart
        ? {
            ...multipart,
            uploadedPartNumbers: multipart.uploadedPartNumbers.filter(
              partNumber => partNumber * multipart.partSize <= kept
            ),
          }
        : null,
      updatedAt: Date.now(),
    });
  });
}

/** Records the multipart upload's progress so a reload resumes rather than resends. */
export async function setDebateRecordingMultipart(
  id: string,
  multipart: StreamedRecordingMultipart | null
): Promise<void> {
  await db.debateRecordingUploads.update(id, { multipart, updatedAt: Date.now() });
}

export async function scheduleDebateRecordingRetry(id: string, error: unknown, nextAttemptAt: number): Promise<void> {
  await db.transaction('rw', db.debateRecordingUploads, async () => {
    const upload = await db.debateRecordingUploads.get(id);
    if (!upload) return;
    await db.debateRecordingUploads.update(id, {
      attemptCount: upload.attemptCount + 1,
      nextAttemptAt,
      lastError: uploadErrorMessage(error),
      updatedAt: Date.now(),
    });
  });
}

export async function deleteDebateRecordingUpload(id: string): Promise<void> {
  await db.transaction('rw', db.debateRecordingUploads, db.debateRecordingUploadChunks, async () => {
    await db.debateRecordingUploadChunks.where('uploadId').equals(id).delete();
    await db.debateRecordingUploads.delete(id);
  });
  inMemoryRecordings.delete(id);
}

/**
 * Stops retrying an upload, and keeps it (GEO-3116). Before this a recording past the retry bound
 * was deleted, which took the only copy with it and left the person with no sign anything was lost.
 */
export async function markDebateRecordingUploadFailed(
  id: string,
  reason: RecordingUploadTerminalReason,
  error: unknown
): Promise<void> {
  await db.debateRecordingUploads.update(id, {
    failedAt: Date.now(),
    failedReason: reason,
    lastError: uploadErrorMessage(error),
    updatedAt: Date.now(),
  });
}

/**
 * Puts a failed upload back in the queue on the person's say-so, with a fresh retry budget. A
 * streamed upload older than R2's seven-day multipart lifetime is sent as one PUT instead, since
 * its parts are gone.
 */
export async function retryFailedDebateRecordingUpload(id: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.debateRecordingUploads, async () => {
    const upload = await db.debateRecordingUploads.get(id);
    if (!upload) return;
    const multipartExpired = upload.multipart && now - upload.createdAt >= MULTIPART_LIFETIME_MS;
    await db.debateRecordingUploads.update(id, {
      failedAt: null,
      failedReason: null,
      attemptCount: 0,
      nextAttemptAt: now,
      lastError: null,
      // A fresh age budget too, or an old recording would be given up on after one attempt.
      retriesStartedAt: now,
      ...(multipartExpired ? { multipart: null, stage: 'queued' as const, filename: null } : {}),
      updatedAt: now,
    });
  });
}

/** Brings a backed-off upload's next attempt forward to now. */
export async function retryDebateRecordingUploadNow(id: string, now = Date.now()): Promise<void> {
  await db.debateRecordingUploads.update(id, { nextAttemptAt: now, updatedAt: now });
}

const MULTIPART_LIFETIME_MS = 7 * 24 * 60 * 60_000;

export async function requestPersistentRecordingStorage(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
  try {
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function estimateRecordingStorage(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}

export function isStorageQuotaError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'QuotaExceededError';
}

export function debateRecordingUploadId(userId: string, debateId: string) {
  return `${userId}:${debateId}`;
}

function uploadErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Recording upload failed.';
}
