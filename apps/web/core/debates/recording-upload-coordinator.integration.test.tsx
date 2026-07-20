import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateRecordingUploadCoordinator } from './recording-upload-coordinator';
import type { DebateRecordingUpload } from './recording-upload-queue';

const mocks = vi.hoisted(() => ({
  cancelRecording: vi.fn(),
  completeUpload: vi.fn(),
  createUpload: vi.fn(),
  deleteUpload: vi.fn(),
  getUpload: vi.fn(),
  getToken: vi.fn(),
  invalidateQueries: vi.fn(),
  lockRequest: vi.fn(),
  markUploaded: vi.fn(),
  observer: null as null | ((uploads: DebateRecordingUpload[]) => void),
  putRecording: vi.fn(),
  queue: [] as DebateRecordingUpload[],
  resolveUser: vi.fn(),
  scheduleRetry: vi.fn(),
}));

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('./hooks', () => ({
  debateQueryKeys: {
    debate: (id: string) => ['debate', id],
    media: (id: string) => ['media', id],
  },
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: true,
    getPrivyIdentityToken: mocks.getToken,
  }),
  useDebateActivity: () => ({ data: undefined }),
}));

vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  cancelDebateRecording: mocks.cancelRecording,
  completeLocalRecordingUpload: mocks.completeUpload,
  createLocalRecordingUpload: mocks.createUpload,
  resolveCurrentGeoChatUserId: mocks.resolveUser,
}));

vi.mock('./recording-upload-queue', async importOriginal => ({
  ...(await importOriginal<typeof import('./recording-upload-queue')>()),
  deleteDebateRecordingUpload: async (id: string) => {
    await mocks.deleteUpload(id);
    mocks.queue = mocks.queue.filter(upload => upload.id !== id);
    mocks.observer?.(mocks.queue);
  },
  getDebateRecordingUpload: (id: string) => mocks.getUpload(id),
  markDebateRecordingUploaded: async (id: string, filename: string) => {
    await mocks.markUploaded(id, filename);
    mocks.queue = mocks.queue.map(upload =>
      upload.id === id
        ? {
            ...upload,
            stage: 'uploaded',
            filename,
            attemptCount: 0,
            nextAttemptAt: Date.now(),
            lastError: null,
            updatedAt: Date.now(),
          }
        : upload
    );
    mocks.observer?.(mocks.queue);
  },
  observeDebateRecordingUploads: () => ({
    subscribe: ({ next }: { next: (uploads: DebateRecordingUpload[]) => void }) => {
      mocks.observer = next;
      next(mocks.queue);
      return { unsubscribe: () => (mocks.observer = null) };
    },
  }),
  scheduleDebateRecordingRetry: async (id: string, error: unknown, nextAttemptAt: number) => {
    await mocks.scheduleRetry(id, error, nextAttemptAt);
    mocks.queue = mocks.queue.map(upload =>
      upload.id === id
        ? {
            ...upload,
            attemptCount: upload.attemptCount + 1,
            nextAttemptAt,
            lastError: error instanceof Error ? error.message : 'Recording upload failed.',
            updatedAt: Date.now(),
          }
        : upload
    );
    mocks.observer?.(mocks.queue);
  },
}));

beforeEach(() => {
  mocks.cancelRecording.mockReset().mockResolvedValue(undefined);
  mocks.completeUpload.mockReset().mockResolvedValue(undefined);
  mocks.createUpload.mockReset().mockImplementation(async (debateId: string) => ({
    filename: `recordings/${debateId}.webm`,
    upload: {
      url: `https://upload.test/${debateId}`,
      method: 'PUT',
      headers: {},
      expires_at: '2026-07-13T23:59:59.000Z',
    },
  }));
  mocks.deleteUpload.mockReset().mockResolvedValue(undefined);
  mocks.getUpload.mockReset().mockImplementation(async (id: string) => mocks.queue.find(upload => upload.id === id));
  mocks.getToken.mockReset().mockResolvedValue('identity-token');
  mocks.invalidateQueries.mockReset();
  mocks.lockRequest.mockReset().mockImplementation(async (_name, _options, callback) => callback({ name: 'lock' }));
  mocks.markUploaded.mockReset().mockResolvedValue(undefined);
  mocks.observer = null;
  mocks.putRecording.mockReset().mockResolvedValue({ ok: true });
  mocks.queue = [];
  mocks.resolveUser.mockReset().mockResolvedValue('user-a');
  mocks.scheduleRetry.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', mocks.putRecording);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: mocks.lockRequest },
  });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DebateRecordingUploadCoordinator', () => {
  it('recovers a persisted upload on app startup under the browser-wide lock', async () => {
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.completeUpload).toHaveBeenCalledOnce());
    expect(mocks.completeUpload).toHaveBeenCalledWith(
      'debate-1',
      expect.objectContaining({ framerate: 29.97 }),
      expect.anything()
    );
    expect(mocks.lockRequest).toHaveBeenCalledWith(
      'geo:debate-recording-uploader',
      { ifAvailable: true },
      expect.any(Function)
    );
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('waits while offline and resumes when the browser reconnects', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mocks.queue = [
      {
        ...queuedRecording('debate-1'),
        attemptCount: 2,
        nextAttemptAt: Date.now() + 60_000,
        lastError: 'stale upload failure',
      },
    ];

    render(<DebateRecordingUploadCoordinator />);

    expect(await screen.findByText('Waiting to upload 1 debate — waiting for a connection')).toBeInTheDocument();
    expect(screen.queryByText(/stale upload failure/)).not.toBeInTheDocument();
    expect(mocks.createUpload).not.toHaveBeenCalled();

    mocks.queue = mocks.queue.map(upload => ({ ...upload, nextAttemptAt: 0 }));
    mocks.observer?.(mocks.queue);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(mocks.completeUpload).toHaveBeenCalledOnce());
  });

  it('uploads queued recordings sequentially', async () => {
    const firstCompletion = deferred<void>();
    mocks.completeUpload.mockImplementation((debateId: string) =>
      debateId === 'debate-1' ? firstCompletion.promise : Promise.resolve()
    );
    mocks.queue = [queuedRecording('debate-1'), queuedRecording('debate-2')];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() =>
      expect(mocks.completeUpload).toHaveBeenCalledWith('debate-1', expect.anything(), expect.anything())
    );
    expect(screen.getByText('Uploading 2 debates')).toBeInTheDocument();
    expect(mocks.createUpload).not.toHaveBeenCalledWith('debate-2', expect.anything(), expect.anything());

    firstCompletion.resolve();

    await waitFor(() =>
      expect(mocks.completeUpload).toHaveBeenCalledWith('debate-2', expect.anything(), expect.anything())
    );
  });

  it('persists and displays a failed attempt while keeping it queued for automatic retry', async () => {
    const error = new Error('Finalization unavailable');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.completeUpload.mockRejectedValueOnce(error);
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.scheduleRetry).toHaveBeenCalledOnce());
    expect(
      screen.getByText('Waiting to upload 1 debate — Finalization unavailable. Retrying automatically.')
    ).toBeInTheDocument();
    expect(mocks.deleteUpload).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      '[DebateRecordingUploadCoordinator] upload attempt failed:',
      expect.objectContaining({
        debateId: 'debate-1',
        stage: 'uploaded',
        attemptCount: 1,
        nextAttemptAt: expect.any(Number),
        error,
      })
    );
  });

  it('shows a persisted failure immediately on startup without changing the queue entry', async () => {
    const persisted = {
      ...queuedRecording('debate-1'),
      attemptCount: 4,
      nextAttemptAt: Date.now() + 60_000,
      lastError: 'Upload authorization expired',
    };
    mocks.queue = [persisted];

    render(<DebateRecordingUploadCoordinator />);

    expect(
      await screen.findByText('Waiting to upload 1 debate — Upload authorization expired. Retrying automatically.')
    ).toBeInTheDocument();
    expect(mocks.queue[0]).toBe(persisted);
    expect(mocks.createUpload).not.toHaveBeenCalled();
  });

  it('shows the newest failure while preserving the aggregate queue count', async () => {
    mocks.queue = [
      {
        ...queuedRecording('debate-1'),
        nextAttemptAt: Date.now() + 60_000,
        lastError: 'Older failure',
        updatedAt: 100,
      },
      {
        ...queuedRecording('debate-2'),
        nextAttemptAt: Date.now() + 60_000,
        lastError: 'Newest failure',
        updatedAt: 200,
      },
    ];

    render(<DebateRecordingUploadCoordinator />);

    expect(
      await screen.findByText('Waiting to upload 2 debates — Newest failure. Retrying automatically.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Older failure/)).not.toBeInTheDocument();
  });

  it('removes the diagnostic banner after a later retry succeeds', async () => {
    mocks.completeUpload.mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValue(undefined);
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    expect(
      await screen.findByText('Waiting to upload 1 debate — Temporary failure. Retrying automatically.')
    ).toBeInTheDocument();

    mocks.queue = mocks.queue.map(upload => ({ ...upload, nextAttemptAt: 0 }));
    mocks.observer?.(mocks.queue);

    await waitFor(() => expect(mocks.completeUpload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('keeps retrying entries with very high attempt counts', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.completeUpload.mockRejectedValueOnce(new Error('Still unavailable'));
    mocks.queue = [
      {
        ...queuedRecording('debate-1'),
        stage: 'uploaded',
        filename: 'recordings/debate-1.webm',
        attemptCount: 1_000,
      },
    ];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.scheduleRetry).toHaveBeenCalledOnce());
    expect(mocks.queue[0]?.attemptCount).toBe(1_001);
    expect(mocks.deleteUpload).not.toHaveBeenCalled();
  });

  it('cancels the upload and drops the local blob when publish is unchecked', async () => {
    // Keep the upload in flight so the banner stays on screen while we interact with it.
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Publish debate' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete debate forever' }));

    await waitFor(() => expect(mocks.cancelRecording).toHaveBeenCalledWith('debate-1', expect.anything()));
    await waitFor(() => expect(mocks.deleteUpload).toHaveBeenCalledWith('user-a:debate-1'));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('retries transient user resolution failures when the browser reconnects', async () => {
    mocks.queue = [queuedRecording('debate-1')];
    mocks.resolveUser.mockRejectedValueOnce(new Error('auth unavailable')).mockResolvedValue('user-a');

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.resolveUser).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(mocks.resolveUser).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.completeUpload).toHaveBeenCalledOnce());
  });
});

function queuedRecording(debateId: string): DebateRecordingUpload {
  return {
    id: `user-a:${debateId}`,
    userId: 'user-a',
    debateId,
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
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
