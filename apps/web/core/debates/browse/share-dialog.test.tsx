import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { DebateShareDialog } from './share-dialog';

const mocks = vi.hoisted(() => ({ capture: vi.fn(), download: vi.fn(), retry: vi.fn(), status: 'ready' }));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));
vi.mock('~/core/debates/hooks', () => ({
  useDebateMedia: () => ({ data: { artifacts: [{ kind: 'social_video' }] } }),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('../social-video-share', () => ({
  downloadPreparedVideo: mocks.download,
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
});
afterEach(() => {
  cleanup();
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
