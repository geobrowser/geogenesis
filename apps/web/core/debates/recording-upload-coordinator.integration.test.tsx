import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from './api';
import { DebateRecordingUploadCoordinator } from './recording-upload-coordinator';
import type { DebateRecordingUpload } from './recording-upload-queue';

const mocks = vi.hoisted(() => ({
  activityDebate: null as null | { id: string; status: string },
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
  queue: [] as DebateRecordingUpload[],
  resolveUser: vi.fn(),
  scheduleRetry: vi.fn(),
  thankingDebateId: null as string | null,
  thankingHasPendingLocalRecording: false,
  thankingHasUploadedRecording: false,
  thankingRecordingCancelled: false,
  // The card only owns the publish control while it is on screen; these cases are about the
  // banner, which is what is left when it isn't.
  thankingShowsPublishControl: false,
  publishOptOutOffer: null as { debateId: string | null; busy: boolean; cancelled: boolean } | null,
  publishOptOutRequest: null as string | null,
  // Set to hold the presigned PUT open, so a test can read the banner mid-transfer and drive
  // progress itself through `reportProgress`.
  holdUpload: null as Promise<void> | null,
  reportProgress: null as null | ((loadedBytes: number) => void),
}));

// The uploader PUTs through XMLHttpRequest so it can report byte progress, so that is what the
// tests have to stand in for.
class FakeUploadRequest {
  status = 200;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;

  open() {}

  setRequestHeader() {}

  send(body: Blob) {
    const progress = (loadedBytes: number) =>
      this.upload.onprogress?.({ lengthComputable: true, loaded: loadedBytes, total: body.size } as ProgressEvent);
    if (!mocks.holdUpload) {
      progress(body.size);
      this.onload?.();
      return;
    }
    mocks.reportProgress = progress;
    void mocks.holdUpload.then(() => this.onload?.());
  }
}

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('./hooks', () => ({
  debateQueryKeys: {
    debate: (id: string) => ['debate', id],
    media: (id: string) => ['media', id],
    activity: (accountKey: string | null) => ['activity', accountKey],
  },
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: true,
    accountKey: 'user-a',
    getPrivyIdentityToken: mocks.getToken,
  }),
  useDebateActivity: () => ({ data: mocks.activityDebate ? { debate: mocks.activityDebate } : undefined }),
}));

const setPublishOptOutOffer = (offer: { debateId: string | null; busy: boolean; cancelled: boolean }) => {
  mocks.publishOptOutOffer = offer;
};
const setPublishOptOutRequest = (debateId: string | null) => {
  mocks.publishOptOutRequest = debateId;
};

vi.mock('./thanking-debate-store', () => ({
  useThankingDebate: () =>
    mocks.thankingDebateId
      ? {
          debateId: mocks.thankingDebateId,
          hasPendingLocalRecording: mocks.thankingHasPendingLocalRecording,
          hasUploadedRecording: mocks.thankingHasUploadedRecording,
          recordingCancelled: mocks.thankingRecordingCancelled,
          showsPublishControl: mocks.thankingShowsPublishControl,
        }
      : null,
  // Records what the coordinator offers the card, so a case can assert the opt-out is on offer
  // without a room to draw it.
  //
  // The setters are created once rather than per render, which is what `useSetAtom` gives the real
  // component. Fresh identities would put them in effect dependencies that change every render,
  // and the unmount cleanup on the offer would then fire on each one and wipe what the layout
  // effect had just published.
  useSetPublishOptOutOffer: () => setPublishOptOutOffer,
  usePublishOptOutRequest: () => mocks.publishOptOutRequest,
  useSetPublishOptOutRequest: () => setPublishOptOutRequest,
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
  mocks.activityDebate = null;
  mocks.thankingDebateId = 'debate-1';
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
  mocks.queue = [];
  mocks.resolveUser.mockReset().mockResolvedValue('user-a');
  mocks.scheduleRetry.mockReset().mockResolvedValue(undefined);
  mocks.thankingHasUploadedRecording = false;
  mocks.thankingHasPendingLocalRecording = false;
  mocks.thankingRecordingCancelled = false;
  mocks.thankingShowsPublishControl = false;
  mocks.publishOptOutOffer = null;
  mocks.publishOptOutRequest = null;
  mocks.holdUpload = null;
  mocks.reportProgress = null;
  vi.stubGlobal('XMLHttpRequest', FakeUploadRequest);
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
  it('shows progress and cancellation while the recording is still being prepared and ignores stale activity', async () => {
    mocks.queue = [];
    mocks.thankingHasPendingLocalRecording = true;
    mocks.activityDebate = { id: 'debate-1', status: 'in_progress' };

    render(<DebateRecordingUploadCoordinator />);

    expect(await screen.findByText('Preparing debate upload')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Preparing debate upload' })).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('still hides the pending thank-you banner during an unrelated live debate', async () => {
    mocks.queue = [];
    mocks.thankingHasPendingLocalRecording = true;
    mocks.activityDebate = { id: 'debate-2', status: 'in_progress' };

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('recovers a persisted upload on app startup under the browser-wide lock', async () => {
    // App startup, not the thank-you screen, so nothing holds the banner open.
    mocks.thankingDebateId = null;
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.completeUpload).toHaveBeenCalledOnce());
    expect(mocks.completeUpload).toHaveBeenCalledWith(
      'debate-1',
      expect.objectContaining({ framerate: 29.97 }),
      expect.anything(),
      'user-a'
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
      expect(mocks.completeUpload).toHaveBeenCalledWith('debate-1', expect.anything(), expect.anything(), 'user-a')
    );
    // debate-1's bytes are out and debate-2 hasn't started, so half the queued bytes have shipped.
    expect(screen.getByText('Uploading & publishing 2 debates')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('progressbar', { name: 'Uploading and publishing 2 debates' })).toHaveAttribute(
        'aria-valuenow',
        '50'
      )
    );
    expect(mocks.createUpload).not.toHaveBeenCalledWith('debate-2', expect.anything(), expect.anything(), 'user-a');

    firstCompletion.resolve();

    await waitFor(() =>
      expect(mocks.completeUpload).toHaveBeenCalledWith('debate-2', expect.anything(), expect.anything(), 'user-a')
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
    mocks.thankingDebateId = null;
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

  it('drops the local blob and clears the banner when the debate can no longer be published', async () => {
    // An aborted/cancelled debate finalizes as `recording_not_ready`, which no retry can fix.
    mocks.completeUpload.mockRejectedValue(
      new GeoChatRequestError('debate is not finalizable', 'recording_not_ready', 400)
    );
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.deleteUpload).toHaveBeenCalledWith('user-a:debate-1'));
    expect(mocks.scheduleRetry).not.toHaveBeenCalled();
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

  it('cancels the upload and drops the local blob from the banner action', async () => {
    // Keep the upload in flight so the banner stays on screen while we interact with it.
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(within(screen.getByRole('status')).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete debate forever' }));

    await waitFor(() => expect(mocks.cancelRecording).toHaveBeenCalledWith('debate-1', expect.anything(), 'user-a'));
    await waitFor(() => expect(mocks.deleteUpload).toHaveBeenCalledWith('user-a:debate-1'));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('drops a recording row that finishes persisting after publication was cancelled', async () => {
    mocks.thankingHasPendingLocalRecording = true;

    render(<DebateRecordingUploadCoordinator />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete debate forever' }));

    await waitFor(() => expect(mocks.cancelRecording).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    mocks.queue = [queuedRecording('debate-1')];
    mocks.observer?.(mocks.queue);

    await waitFor(() => expect(mocks.deleteUpload).toHaveBeenCalledWith('user-a:debate-1'));
    expect(mocks.createUpload).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('cancels only the debate whose thank-you screen the user is on', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    // The user is thanking for debate-2 while an earlier recording is still uploading.
    mocks.thankingDebateId = 'debate-2';
    mocks.queue = [queuedRecording('debate-1'), queuedRecording('debate-2')];

    render(<DebateRecordingUploadCoordinator />);

    expect(await screen.findByText('Uploading & publishing 2 debates')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('progressbar', { name: 'Uploading and publishing 2 debates' })).toHaveAttribute(
        'aria-valuenow',
        '50'
      )
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete debate forever' }));

    await waitFor(() => expect(mocks.deleteUpload).toHaveBeenCalledWith('user-a:debate-2'));
    expect(mocks.cancelRecording).toHaveBeenCalledTimes(1);
    expect(mocks.cancelRecording).toHaveBeenCalledWith('debate-2', expect.anything(), 'user-a');
    expect(mocks.deleteUpload).not.toHaveBeenCalledWith('user-a:debate-1');
    // The untouched recording keeps uploading, now without an opt-out.
    expect(await screen.findByText('Uploading & publishing 1 debate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  // GEO-2773. The thank-you card carries the publish switch now, so the bar at the bottom of the
  // screen would be a second voice on the same upload — and the bar is the thing being replaced.
  it('stands down while the thank-you card is carrying the publish control', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.thankingDebateId = 'debate-1';
    mocks.thankingShowsPublishControl = true;
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.publishOptOutOffer?.debateId).toBe('debate-1'));
    expect(screen.queryByText(/Uploading & publishing/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  // Only for the debate the card is about. Another debate's upload has nothing on screen to
  // report it, so the banner is still the only thing that can.
  it('keeps reporting other debates while the card carries the control', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.thankingDebateId = 'debate-2';
    mocks.thankingShowsPublishControl = true;
    mocks.queue = [queuedRecording('debate-1'), queuedRecording('debate-2')];

    render(<DebateRecordingUploadCoordinator />);

    // One, not two: the thank-you debate is the card's to speak for.
    expect(await screen.findByText('Uploading & publishing 1 debate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  // The room learns of a cancellation from its own debate query, which is a refetch away and may
  // never arrive. The coordinator knows the moment the server accepts it, so it says so directly —
  // otherwise the card cannot tell "withdrawn" from "never recorded" and drops the row in between.
  it('tells the card a debate is withdrawn without waiting for the room to refetch', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.thankingDebateId = 'debate-1';
    mocks.thankingShowsPublishControl = true;
    mocks.publishOptOutRequest = 'debate-1';
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete debate forever' }));

    // `thankingRecordingCancelled` stays false throughout: the room has not refetched, and this
    // must not depend on it doing so.
    await waitFor(() => expect(mocks.publishOptOutOffer?.cancelled).toBe(true));
    expect(mocks.thankingRecordingCancelled).toBe(false);
    expect(mocks.publishOptOutOffer?.debateId).toBeNull();
  });

  // Everything the banner says has to come off the uploads it is actually speaking for. Counting
  // one debate while reporting another debate's failure is the way that goes wrong, and the
  // thank-you debate is the one it stops speaking for.
  it('does not report the card debate failure against another debate count', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.thankingDebateId = 'debate-2';
    mocks.thankingShowsPublishControl = true;
    // Both are backing off, so nothing is uploading and the banner is in its waiting state — which
    // is the only state that quotes a failure. Only the card's debate has actually failed.
    mocks.queue = [
      { ...queuedRecording('debate-1'), nextAttemptAt: Date.now() + 60_000 },
      {
        ...queuedRecording('debate-2'),
        attemptCount: 3,
        nextAttemptAt: Date.now() + 60_000,
        lastError: 'Upload failed spectacularly',
      },
    ];

    render(<DebateRecordingUploadCoordinator />);

    // The plain wait, not the failure: debate-1 has nothing wrong with it.
    expect(await screen.findByText('Waiting to upload 1 debate')).toBeInTheDocument();
    expect(screen.queryByText(/Upload failed spectacularly/)).not.toBeInTheDocument();
  });

  // Activity has to be measured against the uploads the banner speaks for. The one in flight can be
  // the thank-you debate's, which the card reports — counted as the banner's, it claimed to be
  // uploading while every recording it does report was sitting in backoff.
  it('does not call itself uploading while only the card debate is in flight', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.thankingDebateId = 'debate-2';
    mocks.thankingShowsPublishControl = true;
    mocks.queue = [
      // Backing off, so it cannot be the upload in flight — the card's debate is.
      { ...queuedRecording('debate-1'), nextAttemptAt: Date.now() + 60_000 },
      queuedRecording('debate-2'),
    ];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.completeUpload).toHaveBeenCalled());
    expect(await screen.findByText('Waiting to upload 1 debate')).toBeInTheDocument();
  });

  // Switching the control off asks for the same confirmation the Cancel button opened. The ticket
  // called for a new control rather than a new behaviour, and a switch is easier to hit by
  // accident than the button it replaces.
  it('opens the same confirmation when the card asks to stop publishing', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.thankingDebateId = 'debate-1';
    mocks.thankingShowsPublishControl = true;
    mocks.publishOptOutRequest = 'debate-1';
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete debate forever' }));

    await waitFor(() => expect(mocks.cancelRecording).toHaveBeenCalledWith('debate-1', expect.anything(), 'user-a'));
    expect(mocks.deleteUpload).toHaveBeenCalledWith('user-a:debate-1');
  });

  it('matches the thank-you debate even though the queue stores ids dashless', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    // The queue stores `debateId` dashless; the room page reports it dashed, as the debate API does.
    mocks.thankingDebateId = '019fa4c0-664c-7dc0-ac08-9e0d45b6c04b';
    mocks.queue = [queuedRecording('019fa4c0664c7dc0ac089e0d45b6c04b')];

    render(<DebateRecordingUploadCoordinator />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete debate forever' }));

    // The cancel request uses the dashless id the queue and backend already agree on.
    await waitFor(() =>
      expect(mocks.cancelRecording).toHaveBeenCalledWith(
        '019fa4c0664c7dc0ac089e0d45b6c04b',
        expect.anything(),
        'user-a'
      )
    );
  });

  it('offers no cancellation action once the thank-you period is over', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.thankingDebateId = null;
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    expect(await screen.findByText('Uploading & publishing 1 debate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('keeps the banner and cancellation action through the thank-you screen after the upload finishes', async () => {
    // The fast-connection race: the upload finishes before the user can reach the Cancel action.
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.deleteUpload).toHaveBeenCalledWith('user-a:debate-1'));
    expect(await screen.findByText('Debate uploaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('restores the uploaded banner from the debate snapshot after a remount', async () => {
    mocks.queue = [];
    mocks.thankingHasUploadedRecording = true;

    render(<DebateRecordingUploadCoordinator />);

    expect(await screen.findByText('Debate uploaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(mocks.createUpload).not.toHaveBeenCalled();
  });

  it('keeps the uploaded thank-you message while an unrelated debate continues uploading', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.thankingHasUploadedRecording = true;
    mocks.queue = [queuedRecording('debate-2')];

    render(<DebateRecordingUploadCoordinator />);

    expect(await screen.findByText('Debate uploaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.createUpload).toHaveBeenCalledWith(
        'debate-2',
        expect.objectContaining({ mime_type: 'video/webm' }),
        expect.anything(),
        'user-a'
      )
    );
  });

  it('cancels an uploaded recording restored from the debate snapshot', async () => {
    mocks.queue = [];
    mocks.thankingHasUploadedRecording = true;

    render(<DebateRecordingUploadCoordinator />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete debate forever' }));

    await waitFor(() => expect(mocks.cancelRecording).toHaveBeenCalledWith('debate-1', expect.anything(), 'user-a'));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['debate', 'debate-1'] });
    // Cancelling ends the debate and the rematch it anchored; until activity says so, every Debate
    // control on every surface stays greyed out for the viewer who just cancelled.
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['activity', 'user-a'] });
  });

  it('removes a stale local upload restored for an already cancelled debate', async () => {
    mocks.thankingRecordingCancelled = true;
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.deleteUpload).toHaveBeenCalledWith('user-a:debate-1'));
    expect(mocks.completeUpload).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('keeps the confirmation and local upload when cancellation fails', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.cancelRecording.mockRejectedValue(new Error('Cancellation failed'));
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete debate forever' }));

    expect(await screen.findByText('Cancellation failed')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Don’t want to publish?' })).toBeInTheDocument();
    expect(mocks.deleteUpload).not.toHaveBeenCalled();
    expect(mocks.queue).toHaveLength(1);
  });

  it('keeps publication cancelled when server cancellation succeeds but local cleanup fails', async () => {
    mocks.completeUpload.mockImplementation(() => new Promise<void>(() => undefined));
    mocks.deleteUpload.mockRejectedValue(new Error('IndexedDB unavailable'));
    mocks.queue = [queuedRecording('debate-1')];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<DebateRecordingUploadCoordinator />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete debate forever' }));

    expect(
      await screen.findByText(
        'Publication was cancelled, but this device could not remove its local recording. Try again.'
      )
    ).toBeInTheDocument();
    expect(mocks.cancelRecording).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument());
  });

  it('still cancels an already uploaded recording from the banner during thanking', async () => {
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    expect(await screen.findByText('Debate uploaded')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete debate forever' }));

    await waitFor(() => expect(mocks.cancelRecording).toHaveBeenCalledWith('debate-1', expect.anything(), 'user-a'));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('drops the banner when the thank-you screen ends', async () => {
    mocks.queue = [queuedRecording('debate-1')];

    const { rerender } = render(<DebateRecordingUploadCoordinator />);

    expect(await screen.findByText('Debate uploaded')).toBeInTheDocument();

    mocks.thankingDebateId = null;
    rerender(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('offers no opt-out for a recording the backend rejected as unpublishable', async () => {
    // Dropped for good, so there is nothing left to publish or to cancel.
    mocks.completeUpload.mockRejectedValue(
      new GeoChatRequestError('debate is not finalizable', 'recording_not_ready', 400)
    );
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.deleteUpload).toHaveBeenCalledWith('user-a:debate-1'));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('reports upload progress as a percentage while bytes are in flight', async () => {
    const held = deferred<void>();
    mocks.holdUpload = held.promise;
    mocks.queue = [queuedRecording('debate-1')];

    render(<DebateRecordingUploadCoordinator />);

    await waitFor(() => expect(mocks.reportProgress).not.toBeNull());
    // byteSize is 9, so 3 bytes out is a third of the recording.
    mocks.reportProgress!(3);

    expect(await screen.findByText('Uploading & publishing 1 debate')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('progressbar', { name: 'Uploading and publishing 1 debate' })).toHaveAttribute(
        'aria-valuenow',
        '33'
      )
    );

    held.resolve();
    await waitFor(() => expect(mocks.completeUpload).toHaveBeenCalledOnce());
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
