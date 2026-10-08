import { act, cleanup, render, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearLocalVotes, markSaveRequested, readLocalVotes, toggleLocalVote } from '~/core/state/local-votes';

import { LocalVotesSaver } from './local-votes-saver';

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  smartAccount: null as unknown,
  personalSpaceId: null as string | null,
  isRegistered: false,
  held: new Map<string, string | null>(),
  submit: vi.fn(),
  setToast: vi.fn(),
  reportError: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: mocks.smartAccount }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isRegistered: mocks.isRegistered }),
}));
vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: ({ entityId, responseKind }: { entityId: string; responseKind: string }) => ({
    // Named with its kind when it isn't a side on a claim, so a test can tell an upvote from a side.
    submitResponseAsync: (direction: string) =>
      mocks.submit(responseKind === 'stance' ? entityId : `${entityId}:${responseKind}`, direction),
  }),
}));
vi.mock('~/core/responses/replay-viewer-response', () => ({
  readViewerResponseForReplay: async (_client: unknown, { entityId }: { entityId: string }) =>
    mocks.held.get(entityId) ?? null,
}));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => mocks.reportError }));
vi.mock('~/core/action-context-provider', () => ({
  ActionContextProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('~/core/save-votes-analytics', () => ({
  captureLocalVoteDropped: (...args: unknown[]) => mocks.capture(...args),
}));

const vote = (
  entityId: string,
  direction: 'positive' | 'negative' = 'positive',
  responseKind: 'stance' | 'curation' = 'stance'
) => toggleLocalVote({ entityId, spaceId: 'space-1', responseKind, direction, title: entityId });

function signInWithSpace() {
  mocks.authenticated = true;
  mocks.smartAccount = { account: { address: '0xviewer' } };
  mocks.personalSpaceId = 'personal-space';
  mocks.isRegistered = true;
}

afterEach(cleanup);

beforeEach(() => {
  clearLocalVotes();
  mocks.ready = true;
  mocks.authenticated = false;
  mocks.smartAccount = null;
  mocks.personalSpaceId = null;
  mocks.isRegistered = false;
  mocks.held.clear();
  mocks.submit.mockReset().mockResolvedValue(undefined);
  mocks.setToast.mockReset();
  mocks.reportError.mockReset();
  mocks.capture.mockReset();
});

describe('LocalVotesSaver', () => {
  it('does nothing while signed out', () => {
    vote('a');
    render(<LocalVotesSaver />);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(readLocalVotes().votes).toHaveLength(1);
  });

  it('clears the votes when the sign-in was not a save', () => {
    vote('a');
    vote('b');
    signInWithSpace();
    render(<LocalVotesSaver />);

    expect(readLocalVotes().votes).toEqual([]);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith('other_sign_in', expect.objectContaining({ entityId: 'a' }), 2);
  });

  it('waits for the personal space, then saves each vote in turn', async () => {
    vote('a');
    vote('b', 'negative');
    markSaveRequested();
    mocks.authenticated = true;
    const { rerender } = render(<LocalVotesSaver />);
    expect(readLocalVotes().save?.confirmed).toBe(true);
    expect(mocks.submit).not.toHaveBeenCalled();

    signInWithSpace();
    rerender(<LocalVotesSaver />);

    await waitFor(() => expect(readLocalVotes().votes).toEqual([]));
    expect(mocks.submit.mock.calls).toEqual([
      ['a', 'positive'],
      ['b', 'negative'],
    ]);
    expect(mocks.setToast).toHaveBeenCalledWith(expect.anything(), { persistent: true });
    expect(mocks.setToast).toHaveBeenLastCalledWith(expect.anything());
    expect(readLocalVotes().save).toBeNull();
  });

  it('saves an up/downvote as one, beside the sides on claims', async () => {
    vote('claim');
    vote('entity', 'negative', 'curation');
    markSaveRequested();
    signInWithSpace();
    render(<LocalVotesSaver />);

    await waitFor(() => expect(readLocalVotes().votes).toEqual([]));
    expect(mocks.submit.mock.calls).toEqual([
      ['claim', 'positive'],
      ['entity:curation', 'negative'],
    ]);
  });

  it('skips a side the account already holds, and switches one it holds the other way', async () => {
    vote('held');
    vote('opposite');
    mocks.held.set('held', 'positive');
    mocks.held.set('opposite', 'negative');
    markSaveRequested();
    signInWithSpace();
    render(<LocalVotesSaver />);

    await waitFor(() => expect(readLocalVotes().votes).toEqual([]));
    expect(mocks.submit.mock.calls).toEqual([['opposite', 'positive']]);
    expect(mocks.capture).toHaveBeenCalledWith('already_held', expect.objectContaining({ entityId: 'held' }), 2);
  });

  it('keeps the votes and offers a retry when a write fails', async () => {
    vote('a');
    vote('b');
    mocks.submit.mockRejectedValueOnce(new Error('bundler down'));
    markSaveRequested();
    signInWithSpace();
    render(<LocalVotesSaver />);

    await waitFor(() => expect(mocks.reportError).toHaveBeenCalled());
    expect(mocks.reportError.mock.calls[0][0]).toMatch(/^Couldn't save your votes: /);
    expect(readLocalVotes().votes).toHaveLength(2);

    act(() => mocks.reportError.mock.calls[0][1]());
    await waitFor(() => expect(readLocalVotes().votes).toEqual([]));
  });
});
