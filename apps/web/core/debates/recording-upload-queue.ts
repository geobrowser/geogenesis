import { liveQuery } from 'dexie';

import { db } from '~/core/database/indexeddb';

export type DebateRecordingUploadStage = 'queued' | 'uploaded';

export type DebateRecordingUpload = {
  id: string;
  userId: string;
  debateId: string;
  blob: Blob;
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
  attemptCount: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type EnqueueDebateRecordingUpload = {
  userId: string;
  debateId: string;
  blob: Blob;
  mimeType: string;
  startedAtMs: number;
  endedAtMs: number;
  durationSeconds: number;
  width?: number | null;
  height?: number | null;
  framerate?: number | null;
  videoBitsPerSecond?: number | null;
};

export async function enqueueDebateRecordingUpload(
  input: EnqueueDebateRecordingUpload
): Promise<DebateRecordingUpload> {
  const id = debateRecordingUploadId(input.userId, input.debateId);

  return db.transaction('rw', db.debateRecordingUploads, async () => {
    const existing = await db.debateRecordingUploads.get(id);
    if (existing) return existing;

    const now = Date.now();
    const upload: DebateRecordingUpload = {
      id,
      userId: input.userId,
      debateId: input.debateId,
      blob: input.blob,
      mimeType: input.mimeType,
      startedAtMs: input.startedAtMs,
      endedAtMs: input.endedAtMs,
      durationSeconds: input.durationSeconds,
      byteSize: input.blob.size,
      width: input.width ?? null,
      height: input.height ?? null,
      framerate: input.framerate ?? null,
      videoBitsPerSecond: input.videoBitsPerSecond ?? null,
      stage: 'queued',
      filename: null,
      attemptCount: 0,
      nextAttemptAt: now,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.debateRecordingUploads.add(upload);
    return upload;
  });
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
  await db.debateRecordingUploads.delete(id);
}

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
