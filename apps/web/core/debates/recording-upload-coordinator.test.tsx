import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DebateRecordingUploadPill,
  processDebateRecordingUpload,
  recordingUploadRetryDelay,
} from './recording-upload-coordinator';
import type { DebateRecordingUpload } from './recording-upload-queue';

afterEach(cleanup);

describe('debate recording uploader', () => {
  it('uploads, persists the filename, finalizes, and deletes a queued recording', async () => {
    const upload = queuedRecording();
    const dependencies = uploadDependencies();

    await processDebateRecordingUpload(upload, dependencies);

    expect(dependencies.createUpload).toHaveBeenCalledWith('debate-1', {
      mime_type: 'video/webm',
      started_at_ms: 1_000,
    });
    expect(dependencies.putRecording).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://upload.test/recording', method: 'PUT' }),
      upload.blob,
      'video/webm'
    );
    expect(dependencies.markUploaded).toHaveBeenCalledWith(upload.id, 'recordings/debate-1/recording.webm');
    expect(dependencies.completeUpload).toHaveBeenCalledWith(
      'debate-1',
      expect.objectContaining({
        filename: 'recordings/debate-1/recording.webm',
        byte_size: upload.blob.size,
        started_at_ms: 1_000,
        ended_at_ms: 11_000,
      })
    );
    expect(dependencies.deleteUpload).toHaveBeenCalledWith(upload.id);
  });

  it('retries only finalization after the object upload was persisted', async () => {
    const upload = {
      ...queuedRecording(),
      stage: 'uploaded' as const,
      filename: 'recordings/debate-1/recording.webm',
    };
    const dependencies = uploadDependencies();

    await processDebateRecordingUpload(upload, dependencies);

    expect(dependencies.createUpload).not.toHaveBeenCalled();
    expect(dependencies.putRecording).not.toHaveBeenCalled();
    expect(dependencies.markUploaded).not.toHaveBeenCalled();
    expect(dependencies.completeUpload).toHaveBeenCalledOnce();
    expect(dependencies.deleteUpload).toHaveBeenCalledWith(upload.id);
  });

  it('does not delete a recording when object upload or finalization fails', async () => {
    const dependencies = uploadDependencies();
    dependencies.completeUpload.mockRejectedValue(new Error('finalization unavailable'));

    await expect(processDebateRecordingUpload(queuedRecording(), dependencies)).rejects.toThrow(
      'finalization unavailable'
    );

    expect(dependencies.markUploaded).toHaveBeenCalledOnce();
    expect(dependencies.deleteUpload).not.toHaveBeenCalled();
  });

  it('uses bounded exponential retry delays', () => {
    expect(recordingUploadRetryDelay(0)).toBe(5_000);
    expect(recordingUploadRetryDelay(1)).toBe(10_000);
    expect(recordingUploadRetryDelay(12)).toBe(120_000);
  });
});

describe('DebateRecordingUploadPill', () => {
  it('shows upload count and dismisses only its presentation', () => {
    const dismiss = vi.fn();
    render(<DebateRecordingUploadPill count={1} waiting={false} onDismiss={dismiss} />);

    expect(screen.getByText('Uploading 1 debate')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide recording upload status' }));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('shows plural waiting copy while offline or backing off', () => {
    render(<DebateRecordingUploadPill count={2} waiting onDismiss={() => undefined} />);

    expect(screen.getByText('Waiting to upload 2 debates')).toBeInTheDocument();
  });
});

function queuedRecording(): DebateRecordingUpload {
  return {
    id: 'user-a:debate-1',
    userId: 'user-a',
    debateId: 'debate-1',
    blob: new Blob(['recording'], { type: 'video/webm' }),
    mimeType: 'video/webm',
    startedAtMs: 1_000,
    endedAtMs: 11_000,
    durationSeconds: 10,
    byteSize: 9,
    width: null,
    height: null,
    framerate: null,
    videoBitsPerSecond: null,
    stage: 'queued',
    filename: null,
    attemptCount: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

function uploadDependencies() {
  return {
    createUpload: vi.fn().mockResolvedValue({
      filename: 'recordings/debate-1/recording.webm',
      upload: { url: 'https://upload.test/recording', method: 'PUT', headers: { 'x-upload': 'yes' } },
    }),
    putRecording: vi.fn().mockResolvedValue(undefined),
    markUploaded: vi.fn().mockResolvedValue(undefined),
    completeUpload: vi.fn().mockResolvedValue(undefined),
    deleteUpload: vi.fn().mockResolvedValue(undefined),
  };
}
