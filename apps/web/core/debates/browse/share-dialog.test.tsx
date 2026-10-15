import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { DebateShareDialog } from './share-dialog';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  download: vi.fn(),
  retry: vi.fn(),
  status: 'ready',
  canShareVideo: false,
  coarsePointer: false,
  handoff: vi.fn(),
  windowOpen: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));
vi.mock('~/core/debates/hooks', () => ({
  useDebateMedia: () => ({ data: { artifacts: [{ kind: 'social_video' }] } }),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.toast] }));
vi.mock('../social-video-share', () => ({
  canNativeShareVideo: () => mocks.canShareVideo,
  downloadPreparedVideo: mocks.download,
  handoffPreparedSocialVideo: mocks.handoff,
  isAbortError: () => false,
  usePreparedSocialVideo: () => ({
    status: mocks.status,
    downloadUrl: 'blob:video',
    file: { name: 'video.mp4' },
    retry: mocks.retry,
  }),
}));
const debate = { id: 'debate', claim: { claim: 'Private claim text' } } as Debate;
const cases = [
  ['Share on Reddit', 'reddit'],
  ['Share on X', 'x'],
  ['Share on LinkedIn', 'linkedin'],
  ['Download debate video', 'download'],
] as const;
const completed = () => mocks.capture.mock.calls.filter(([event]) => event === 'action_completed');
function mount() {
  render(
    <DebateShareDialog
      open
      onOpenChange={vi.fn()}
      debate={debate}
      spaceId="space"
      openerRef={React.createRef<HTMLButtonElement>()}
    />
  );
}
beforeEach(() => {
  mocks.status = 'ready';
  mocks.canShareVideo = false;
  mocks.handoff.mockReset().mockResolvedValue('native_share');
  vi.stubGlobal('open', mocks.windowOpen);
  mocks.windowOpen.mockReset();
  mocks.toast.mockReset();

  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: query.includes('coarse') ? mocks.coarsePointer : false }) as MediaQueryList
  );
  mocks.coarsePointer = true;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.capture.mockReset();
  mocks.download.mockReset();
  mocks.retry.mockReset();
});

it.each(cases)('records %s failures around the actual handoff', (label, method) => {
  const error = new Error('handoff failed');
  const handoff = () => {
    throw error;
  };
  vi.spyOn(window, 'open').mockImplementation(handoff);
  mocks.download.mockImplementation(handoff);
  const reported: unknown[] = [];
  const onError = (event: ErrorEvent) => {
    reported.push(event.error);
    event.preventDefault();
  };
  window.addEventListener('error', onError);
  try {
    mount();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(reported).toContain(error); // preserve the original thrown-handler behavior
    expect(completed()).toHaveLength(1);
    expect(completed()[0][1]).toMatchObject({ outcome: 'failed', failure_code: 'unavailable', target_id: 'debate' });
    expect(mocks.capture).not.toHaveBeenCalledWith('debate_share_action', expect.objectContaining({ method }));
  } finally {
    window.removeEventListener('error', onError);
  }
});

it.each(cases)('records %s only after the synchronous handoff returns', (label, method) => {
  let outcomesAtHandoff = -1;
  const handoff = () => {
    outcomesAtHandoff = completed().length;
    return null;
  };
  const open = vi.spyOn(window, 'open').mockImplementation(handoff);
  mocks.download.mockImplementation(handoff);
  mount();
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(method === 'download' ? mocks.download : open).toHaveBeenCalledTimes(1);
  expect(outcomesAtHandoff).toBe(0);
  expect(completed()).toHaveLength(1);
  expect(completed()[0][1]).toMatchObject({
    outcome: method === 'download' ? 'succeeded' : 'unknown',
    overlay: 'modal',
  });
  expect(JSON.stringify(completed())).not.toContain('Private claim text');
});

it('retries preparation without claiming a completed download', () => {
  mocks.status = 'error';
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Retry preparing debate video' }));
  expect(mocks.retry).toHaveBeenCalledTimes(1);
  expect(completed()).toHaveLength(0);
});

/*
 * One tile, two hand-offs. X's intent URL reaches the composer directly but has no media parameter,
 * so a video can only travel through the system share sheet — which the device has to offer.
 */
it('hands the video to the share sheet when the device can carry one', async () => {
  mocks.canShareVideo = true;
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));
  await vi.waitFor(() => expect(mocks.handoff).toHaveBeenCalledTimes(1));

  expect(mocks.handoff.mock.calls[0][0]).toMatchObject({ debateId: 'debate', file: { name: 'video.mp4' } });
  expect(mocks.windowOpen).not.toHaveBeenCalled();
});

it('falls back to the X composer when the device cannot share files', () => {
  mocks.canShareVideo = false;
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));

  expect(mocks.handoff).not.toHaveBeenCalled();
  expect(mocks.windowOpen.mock.calls[0][0]).toContain('twitter.com/intent/tweet');
});

// The video is prepared while the sheet is open, so a tap before it lands must still reach X.
it('falls back to the composer while the video is still preparing', () => {
  mocks.canShareVideo = true;
  mocks.status = 'preparing';
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));

  expect(mocks.handoff).not.toHaveBeenCalled();
  expect(mocks.windowOpen.mock.calls[0][0]).toContain('twitter.com/intent/tweet');
});

// A second tap calls `share()` while a sheet is already open, which throws `NotAllowedError` — and
// that is classified unretryable, so the video would silently download instead.
/*
 * `canShare({files})` answers true on desktop Chrome and then `share()` refuses, so the capability
 * check alone took the X button away from the composer it has always opened — on every desktop.
 */
it('keeps the X composer on a desktop pointer, whatever canShare says', () => {
  mocks.canShareVideo = true;
  mocks.coarsePointer = false;
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));

  expect(mocks.handoff).not.toHaveBeenCalled();
  expect(mocks.windowOpen.mock.calls[0][0]).toContain('twitter.com/intent/tweet');
});

type Unshareable = { onUnshareable?: (info: { userActivationSpent: boolean }) => void };
const refuses =
  (userActivationSpent: boolean) =>
  async ({ onUnshareable }: Unshareable) => {
    onUnshareable?.({ userActivationSpent });
    return 'unshareable';
  };

//Refused before anything was shared — `canShare` said no.
it('opens the X composer when the file was never shareable, rather than downloading', async () => {
  mocks.canShareVideo = true;
  mocks.handoff.mockImplementation(refuses(false));
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));
  await vi.waitFor(() => expect(mocks.windowOpen).toHaveBeenCalled());

  expect(mocks.windowOpen.mock.calls[0][0]).toContain('twitter.com/intent/tweet');
  expect(mocks.download).not.toHaveBeenCalled();
});

/*
 * `share()` consumes transient activation before its promise settles, so a refusal coming back
 * from it leaves nothing to open a window with — the popup blocker takes it and the fallback does
 * nothing at all. Ask for a fresh tap, which arrives with its own activation.
 */
it('asks for another tap when the refusal arrives after the activation is spent', async () => {
  mocks.canShareVideo = true;
  mocks.handoff.mockImplementation(refuses(true));
  mount();

  fireEvent.click(screen.getByRole('button', { name: 'Share on X' }));
  await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalled());

  expect(mocks.windowOpen).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
});

it('takes the composer on the next tap after a refusal', async () => {
  mocks.canShareVideo = true;
  mocks.handoff.mockImplementation(refuses(true));
  mount();

  const x = screen.getByRole('button', { name: 'Share on X' });
  fireEvent.click(x);
  await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalled());

  fireEvent.click(x);

  expect(mocks.handoff).toHaveBeenCalledTimes(1);
  expect(mocks.windowOpen.mock.calls[0][0]).toContain('twitter.com/intent/tweet');
});

it('ignores a second tap while the share sheet is open', async () => {
  mocks.canShareVideo = true;
  let settle: (value: string) => void = () => {};
  mocks.handoff.mockReturnValue(new Promise<string>(resolve => (settle = resolve)));
  mount();

  const x = screen.getByRole('button', { name: 'Share on X' });
  fireEvent.click(x);
  fireEvent.click(x);

  expect(mocks.handoff).toHaveBeenCalledTimes(1);
  settle('native_share');
});
