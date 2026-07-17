import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DebateCancelUploadDialog,
  DebateRecordingUploadBanner,
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
    expect(recordingUploadRetryDelay(12)).toBe(300_000);
  });
});

describe('DebateRecordingUploadBanner', () => {
  it('shows the upload count with the publish checkbox checked', () => {
    render(<DebateRecordingUploadBanner count={1} waiting={false} publishChecked onUncheckPublish={() => undefined} />);

    expect(screen.getByText('Uploading 1 debate')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Publish debate' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows plural waiting copy while offline or backing off', () => {
    render(<DebateRecordingUploadBanner count={2} waiting publishChecked onUncheckPublish={() => undefined} />);

    expect(screen.getByText('Waiting to upload 2 debates')).toBeInTheDocument();
  });

  it('asks to cancel only when unchecking a checked publish box', () => {
    const uncheck = vi.fn();
    const { rerender } = render(
      <DebateRecordingUploadBanner count={1} waiting={false} publishChecked onUncheckPublish={uncheck} />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Publish debate' }));
    expect(uncheck).toHaveBeenCalledOnce();

    rerender(
      <DebateRecordingUploadBanner count={1} waiting={false} publishChecked={false} onUncheckPublish={uncheck} />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Publish debate' }));
    expect(uncheck).toHaveBeenCalledOnce();
  });
});

describe('DebateCancelUploadDialog', () => {
  it('confirms and closes the permanent-removal prompt', () => {
    const confirm = vi.fn();
    const close = vi.fn();
    render(<DebateCancelUploadDialog busy={false} error={null} onConfirm={confirm} onClose={close} />);

    expect(screen.getByText("Don't want to publish?")).toBeInTheDocument();
    expect(
      screen.getByText('This action permanently removes this debate video on behalf of you and your opponent.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete debate forever' }));
    expect(confirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('disables the actions while removing', () => {
    render(<DebateCancelUploadDialog busy error={null} onConfirm={() => undefined} onClose={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Removing...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
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
