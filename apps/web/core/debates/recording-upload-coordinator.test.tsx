import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from './api';
import {
  DebateCancelUploadDialog,
  DebateRecordingUploadBanner,
  isPermanentRecordingUploadError,
  processDebateRecordingUpload,
  recordingUploadRetryDelay,
} from './recording-upload-coordinator';
import type { DebateRecordingUpload } from './recording-upload-queue';

afterEach(cleanup);

describe('isPermanentRecordingUploadError', () => {
  it('treats unpublishable backend rejections as permanent', () => {
    for (const code of [
      'recording_cancelled',
      'recording_not_ready',
      'invalid_recording',
      'invalid_recording_mime_type',
      'recording_upload_missing',
      'recording_upload_size_mismatch',
      'recording_upload_type_mismatch',
    ]) {
      expect(isPermanentRecordingUploadError(new GeoChatRequestError('nope', code, 400))).toBe(true);
    }
  });

  it('keeps transient failures retryable', () => {
    expect(isPermanentRecordingUploadError(new GeoChatRequestError('down', 'object_store_not_configured', 503))).toBe(
      false
    );
    // A 5xx that happens to reuse a permanent code is still transient.
    expect(isPermanentRecordingUploadError(new GeoChatRequestError('flaky', 'recording_not_ready', 500))).toBe(false);
    expect(isPermanentRecordingUploadError(new GeoChatRequestError('unknown 400', 'some_new_code', 400))).toBe(false);
    expect(isPermanentRecordingUploadError(new Error('network'))).toBe(false);
  });
});

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
        framerate: 29.97,
      })
    );
    expect(dependencies.deleteUpload).toHaveBeenCalledWith(upload.id);
  });

  it('rounds fractional timestamps from a persisted queue entry', async () => {
    const upload = {
      ...queuedRecording(),
      startedAtMs: 1_784_542_272_505.1,
      endedAtMs: 1_784_542_282_505.6,
    };
    const dependencies = uploadDependencies();

    await processDebateRecordingUpload(upload, dependencies);

    expect(dependencies.createUpload).toHaveBeenCalledWith(
      upload.debateId,
      expect.objectContaining({ started_at_ms: 1_784_542_272_505 })
    );
    expect(dependencies.completeUpload).toHaveBeenCalledWith(
      upload.debateId,
      expect.objectContaining({
        started_at_ms: 1_784_542_272_505,
        ended_at_ms: 1_784_542_282_506,
      })
    );
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

  describe('a recording streamed during the debate (GEO-2955)', () => {
    const multipart = {
      filename: 'recordings/debate-1/streamed.local.webm',
      uploadId: 'upload-1',
      partSize: 4,
      uploadedPartNumbers: [1],
    };

    function streamedRecording(): DebateRecordingUpload {
      // 'recording' is 9 bytes: part 1 went out live, parts 2 and 3 are left.
      return { ...queuedRecording(), multipart };
    }

    function streamedDependencies() {
      return {
        ...uploadDependencies(),
        getPartUrls: vi.fn(async (_debateId: string, _filename: string, _uploadId: string, partNumbers: number[]) =>
          partNumbers.map(partNumber => ({
            part_number: partNumber,
            upload: {
              method: 'PUT',
              url: `https://r2.test/${partNumber}`,
              headers: {},
              expires_at: '2099-01-01T00:00:00Z',
            },
          }))
        ),
        putPart: vi.fn().mockResolvedValue(undefined),
        setMultipart: vi.fn().mockResolvedValue(undefined),
        requeueParts: vi.fn().mockResolvedValue(undefined),
      };
    }

    it('sends only the parts that did not go out live, then completes the multipart upload', async () => {
      const dependencies = streamedDependencies();

      await processDebateRecordingUpload(streamedRecording(), dependencies);

      expect(dependencies.getPartUrls).toHaveBeenCalledWith('debate-1', multipart.filename, 'upload-1', [2, 3]);
      expect(dependencies.putPart).toHaveBeenCalledTimes(2);
      // Neither the single-PUT slot nor its body is touched.
      expect(dependencies.createUpload).not.toHaveBeenCalled();
      expect(dependencies.putRecording).not.toHaveBeenCalled();
      expect(dependencies.setMultipart).toHaveBeenLastCalledWith('user-a:debate-1', {
        ...multipart,
        uploadedPartNumbers: [1, 2, 3],
      });
      expect(dependencies.markUploaded).toHaveBeenCalledWith('user-a:debate-1', multipart.filename);
      expect(dependencies.completeUpload).toHaveBeenCalledWith(
        'debate-1',
        expect.objectContaining({ filename: multipart.filename, multipart_upload_id: 'upload-1', byte_size: 9 })
      );
      expect(dependencies.deleteUpload).toHaveBeenCalledWith('user-a:debate-1');
    });

    it('falls back to one PUT when geo-chat no longer has the multipart routes', async () => {
      const dependencies = streamedDependencies();
      dependencies.getPartUrls.mockRejectedValue(new GeoChatRequestError('404 Not Found', null, 404));

      await processDebateRecordingUpload(streamedRecording(), dependencies);

      expect(dependencies.setMultipart).toHaveBeenCalledWith('user-a:debate-1', null);
      expect(dependencies.putRecording).toHaveBeenCalledOnce();
      expect(dependencies.completeUpload).toHaveBeenCalledWith(
        'debate-1',
        expect.not.objectContaining({ multipart_upload_id: expect.anything() })
      );
    });

    it('resends every part when the server reports parts this client believed sent are missing', async () => {
      const dependencies = streamedDependencies();
      dependencies.completeUpload.mockRejectedValue(
        new GeoChatRequestError('recording part 1 has not been uploaded', 'recording_upload_incomplete', 400)
      );

      await expect(processDebateRecordingUpload(streamedRecording(), dependencies)).rejects.toThrow(
        'recording part 1 has not been uploaded'
      );

      expect(dependencies.requeueParts).toHaveBeenCalledWith('user-a:debate-1');
      expect(dependencies.deleteUpload).not.toHaveBeenCalled();
      // And it is a retry, not a reason to drop the recording.
      expect(
        isPermanentRecordingUploadError(new GeoChatRequestError('incomplete', 'recording_upload_incomplete', 400))
      ).toBe(false);
    });

    it('goes straight to completion once every part is out', async () => {
      const dependencies = streamedDependencies();

      await processDebateRecordingUpload(
        { ...streamedRecording(), stage: 'uploaded', filename: multipart.filename },
        dependencies
      );

      expect(dependencies.putPart).not.toHaveBeenCalled();
      expect(dependencies.completeUpload).toHaveBeenCalledWith(
        'debate-1',
        expect.objectContaining({ multipart_upload_id: 'upload-1' })
      );
    });
  });

  it('uses bounded exponential retry delays', () => {
    expect(recordingUploadRetryDelay(0)).toBe(5_000);
    expect(recordingUploadRetryDelay(1)).toBe(10_000);
    expect(recordingUploadRetryDelay(12)).toBe(300_000);
    expect(recordingUploadRetryDelay(1_000)).toBe(300_000);
  });
});

describe('DebateRecordingUploadBanner', () => {
  it('shows the upload and publishing state with determinate progress and a cancel action', () => {
    const cancel = vi.fn();
    render(
      <DebateRecordingUploadBanner
        count={1}
        percent={57}
        waitingReason={null}
        errorMessage={null}
        canCancel
        onCancel={cancel}
      />
    );

    expect(screen.getByText('Uploading & publishing 1 debate')).toBeInTheDocument();
    const banner = screen.getByRole('status');
    const content = screen.getByText('Uploading & publishing 1 debate').parentElement;
    expect(banner).toHaveClass('h-10', 'items-center', 'justify-center');
    // The bar sits in the middle column of three, so it stays centred on the viewport.
    expect(content).toHaveClass('grid', 'w-full', 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]', 'md:gap-x-[50px]');
    expect(screen.getByText('Uploading & publishing 1 debate')).toHaveClass('justify-self-end', 'truncate');
    expect(content?.children[1]).toHaveAttribute('role', 'progressbar');
    const progress = screen.getByRole('progressbar', { name: 'Uploading and publishing 1 debate' });
    expect(progress).toHaveAttribute('aria-valuemin', '0');
    expect(progress).toHaveAttribute('aria-valuemax', '100');
    expect(progress).toHaveAttribute('aria-valuenow', '57');
    expect(progress.firstElementChild).toHaveStyle({ width: '57%' });

    // Closing the tab strands the upload, so the banner says so for as long as one is pending.
    expect(screen.getByText('Keep browser open')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows indeterminate progress while the thank-you recording is still being prepared', () => {
    render(
      <DebateRecordingUploadBanner
        count={1}
        preparingOnly
        waitingReason="waiting"
        errorMessage={null}
        canCancel={false}
        onCancel={() => undefined}
      />
    );

    expect(screen.getByText('Preparing debate upload')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Preparing debate upload' })).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('Keep browser open')).toBeInTheDocument();
  });

  it('keeps the browser warning up while uploads are waiting rather than transferring', () => {
    render(
      <DebateRecordingUploadBanner
        count={2}
        waitingReason="retry"
        errorMessage="Finalization unavailable"
        canCancel={false}
        onCancel={() => undefined}
      />
    );

    // No bytes are moving, but the retry still needs the tab.
    expect(screen.getByText('Keep browser open')).toBeInTheDocument();
  });

  it('pluralizes the count and shows indeterminate progress while the percentage is unavailable', () => {
    render(
      <DebateRecordingUploadBanner
        count={2}
        waitingReason={null}
        errorMessage={null}
        canCancel
        onCancel={() => undefined}
      />
    );

    expect(screen.getByText('Uploading & publishing 2 debates')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Uploading and publishing 2 debates' })).not.toHaveAttribute(
      'aria-valuenow'
    );
  });

  it('drops the cancel action once the thank-you period is over', () => {
    render(
      <DebateRecordingUploadBanner
        count={1}
        waitingReason={null}
        errorMessage={null}
        canCancel={false}
        onCancel={() => undefined}
      />
    );

    expect(screen.getByText('Uploading & publishing 1 debate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('shows generic plural waiting copy when no reason is available', () => {
    render(
      <DebateRecordingUploadBanner
        count={2}
        waitingReason="waiting"
        errorMessage={null}
        canCancel
        onCancel={() => undefined}
      />
    );

    expect(screen.getByText('Waiting to upload 2 debates')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('explains that offline uploads are waiting for a connection', () => {
    render(
      <DebateRecordingUploadBanner
        count={1}
        waitingReason="offline"
        errorMessage="stale upload failure"
        canCancel
        onCancel={() => undefined}
      />
    );

    expect(screen.getByText('Waiting to upload 1 debate — waiting for a connection')).toBeInTheDocument();
    expect(screen.queryByText(/stale upload failure/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows the latest failure and says retries are automatic', () => {
    render(
      <DebateRecordingUploadBanner
        count={2}
        waitingReason="retry"
        errorMessage="Finalization unavailable"
        canCancel
        onCancel={() => undefined}
      />
    );

    expect(
      screen.getByText('Waiting to upload 2 debates — Finalization unavailable. Retrying automatically.')
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('keeps long failure text in the live region while visually truncating it', () => {
    const longError = `Upload failed: ${'connection reset '.repeat(30)}`.trim();
    render(
      <DebateRecordingUploadBanner
        count={1}
        waitingReason="retry"
        errorMessage={longError}
        canCancel
        onCancel={() => undefined}
      />
    );

    const message = `Waiting to upload 1 debate — ${longError}. Retrying automatically.`;
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.getByText(message)).toHaveClass('truncate');
  });

  it('keeps uploaded copy and hides progress after the upload finishes', () => {
    render(
      <DebateRecordingUploadBanner
        count={0}
        thankingUploadFinished
        waitingReason={null}
        errorMessage={null}
        canCancel
        onCancel={() => undefined}
      />
    );

    expect(screen.getByText('Debate uploaded')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    // Nothing is on the wire any more — this line is waiting on the opt-out window.
    expect(screen.queryByText('Keep browser open')).not.toBeInTheDocument();
  });

  // A queue that is still moving outranks "Debate uploaded", which is only worth saying once
  // nothing is left on the wire. The opt-out stays on offer either way.
  it('reports the remaining count over the uploaded copy when uploads are still pending', () => {
    render(
      <DebateRecordingUploadBanner
        count={1}
        thankingUploadFinished
        waitingReason={null}
        errorMessage={null}
        canCancel
        onCancel={() => undefined}
      />
    );

    expect(screen.getByText('Uploading & publishing 1 debate')).toBeInTheDocument();
    expect(screen.getByText('Keep browser open')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Uploading and publishing 1 debate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});

describe('DebateCancelUploadDialog', () => {
  it('confirms and closes the permanent-removal prompt', () => {
    const confirm = vi.fn();
    const close = vi.fn();
    render(<DebateCancelUploadDialog busy={false} error={null} onConfirm={confirm} onClose={close} />);

    expect(screen.getByText('Don’t want to publish?')).toBeInTheDocument();
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
    framerate: 29.97,
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
