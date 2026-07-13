import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateRecordingUploadCoordinator } from './recording-upload-coordinator';
import type { DebateRecordingUpload } from './recording-upload-queue';

const mocks = vi.hoisted(() => ({
  completeUpload: vi.fn(),
  createUpload: vi.fn(),
  deleteUpload: vi.fn(),
  getUpload: vi.fn(),
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
    getPrivyIdentityToken: vi.fn(),
  }),
}));

vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
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
  markDebateRecordingUploaded: mocks.markUploaded,
  observeDebateRecordingUploads: () => ({
    subscribe: ({ next }: { next: (uploads: DebateRecordingUpload[]) => void }) => {
      mocks.observer = next;
      next(mocks.queue);
      return { unsubscribe: () => (mocks.observer = null) };
    },
  }),
  scheduleDebateRecordingRetry: mocks.scheduleRetry,
}));

beforeEach(() => {
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
    expect(mocks.lockRequest).toHaveBeenCalledWith(
      'geo:debate-recording-uploader',
      { ifAvailable: true },
      expect.any(Function)
    );
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('waits while offline and resumes when the browser reconnects', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    expect(await screen.findByText('Waiting to upload 1 debate')).toBeInTheDocument();
    expect(mocks.createUpload).not.toHaveBeenCalled();

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
    expect(mocks.createUpload).not.toHaveBeenCalledWith('debate-2', expect.anything(), expect.anything());

    firstCompletion.resolve();

    await waitFor(() =>
      expect(mocks.completeUpload).toHaveBeenCalledWith('debate-2', expect.anything(), expect.anything())
    );
  });

  it('restores a dismissed upload pill after the app remounts', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mocks.queue = [queuedRecording('debate-1')];

    const firstMount = render(<DebateRecordingUploadCoordinator />);
    fireEvent.click(await screen.findByRole('button', { name: 'Hide recording upload status' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    firstMount.unmount();
    render(<DebateRecordingUploadCoordinator />);

    expect(await screen.findByText('Waiting to upload 1 debate')).toBeInTheDocument();
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
    framerate: null,
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
