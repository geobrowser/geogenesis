import { act, cleanup, render, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthAttempt } from '~/core/auth-attempt';
import {
  bindSaveToAccount,
  clearLocalVotes,
  readLocalVotes,
  removeLocalVote,
  toggleLocalVote,
} from '~/core/state/local-votes';

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
  accountId: 'did:privy:me',
  /** The sign-in that just completed, as `auth-attempt` reports it. */
  attempt: undefined as AuthAttempt | undefined,
  /** Reads held open by a test, per entity, so it can act while the saver is waiting on one. */
  heldReads: new Map<string, Promise<string | null>>(),
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, user: { id: mocks.accountId } }),
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
    mocks.heldReads.get(entityId) ?? mocks.held.get(entityId) ?? null,
}));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => mocks.reportError }));
vi.mock('~/core/action-context-provider', () => ({
  ActionContextProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('~/core/auth-attempt', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/auth-attempt')>()),
  currentAuthAttempt: () => mocks.attempt,
}));
vi.mock('~/core/save-votes-analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/save-votes-analytics')>()),
  captureLocalVoteDropped: (...args: unknown[]) => mocks.capture(...args),
}));

const attempt = (auth_intent: string, outcome?: AuthAttempt['outcome']): AuthAttempt => ({
  id: 'attempt-1',
  startedAt: Date.now(),
  outcome,
  properties: { auth_intent },
});
/** A save prompt's sign-in, completed. */
const saveSignedIn = () => {
  mocks.attempt = attempt('save_votes', 'signed_up');
};

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
  mocks.heldReads.clear();
  mocks.accountId = 'did:privy:me';
  mocks.attempt = undefined;
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
    mocks.attempt = attempt('vote', 'signed_in');
    signInWithSpace();
    render(<LocalVotesSaver />);

    expect(readLocalVotes().votes).toEqual([]);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith('other_sign_in', expect.objectContaining({ entityId: 'a' }), 2);
  });

  it('waits for the personal space, then saves each vote in turn', async () => {
    vote('a');
    vote('b', 'negative');
    saveSignedIn();
    mocks.authenticated = true;
    const { rerender } = render(<LocalVotesSaver />);
    expect(readLocalVotes().save).toEqual({ accountId: 'did:privy:me' });
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
    saveSignedIn();
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
    saveSignedIn();
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
    saveSignedIn();
    signInWithSpace();
    render(<LocalVotesSaver />);

    await waitFor(() => expect(mocks.reportError).toHaveBeenCalled());
    expect(mocks.reportError.mock.calls[0][0]).toMatch(/^Couldn't save your votes: /);
    expect(readLocalVotes().votes).toHaveLength(2);

    act(() => mocks.reportError.mock.calls[0][1]());
    await waitFor(() => expect(readLocalVotes().votes).toEqual([]));
  });

  // Copilot on #2785: the authorization to save is the sign-in itself, not a flag of our own.
  it('does not save when the save sign-in was closed and another one completed', () => {
    vote('a');
    mocks.attempt = attempt('save_votes', 'closed');
    signInWithSpace();
    render(<LocalVotesSaver />);

    expect(readLocalVotes().votes).toEqual([]);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('clears votes a save bound to another account, rather than publishing them as this one', () => {
    vote('a');
    bindSaveToAccount('did:privy:someone-else');
    // Even with a save prompt's sign-in on record: the binding is to the account, not to the browser.
    saveSignedIn();
    signInWithSpace();
    render(<LocalVotesSaver />);

    expect(readLocalVotes().votes).toEqual([]);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('does not publish a vote replaced while it was reading the account’s side', async () => {
    vote('a');
    let finishRead: (side: string | null) => void = () => {};
    mocks.heldReads.set('a', new Promise(resolve => (finishRead = resolve)));
    saveSignedIn();
    signInWithSpace();
    render(<LocalVotesSaver />);

    // A signed-in press on the claim: it removes the device vote and publishes its own side.
    act(() => removeLocalVote({ entityId: 'a', spaceId: 'space-1', responseKind: 'stance' }));
    await act(async () => finishRead(null));

    expect(mocks.submit).not.toHaveBeenCalled();
  });

  // Copilot on #2785 (round 2): every open tab mounts a saver over the same stored votes.
  it('writes each vote once when two savers share the votes, as two tabs do', async () => {
    // Web Locks, one holder at a time, as the browser grants them.
    let held = Promise.resolve();
    const locks = {
      request: (_name: string, run: () => Promise<void>) => {
        const granted = held.then(run);
        held = granted.catch(() => {});
        return granted;
      },
    };
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    try {
      vote('a');
      vote('b', 'negative');
      saveSignedIn();
      signInWithSpace();
      render(
        <>
          <LocalVotesSaver />
          <LocalVotesSaver />
        </>
      );

      await waitFor(() => expect(readLocalVotes().votes).toEqual([]));
      expect(mocks.submit.mock.calls).toEqual([
        ['a', 'positive'],
        ['b', 'negative'],
      ]);
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });

  // Copilot on #2785 (round 2): a vote replaced mid-save must survive whichever way the save ends.
  it('saves a vote cast in place of one the account already held, and drops nothing', async () => {
    vote('a');
    let finishRead: (side: string | null) => void = () => {};
    mocks.heldReads.set('a', new Promise(resolve => (finishRead = resolve)));
    saveSignedIn();
    signInWithSpace();
    render(<LocalVotesSaver />);

    act(() => {
      vote('a');
      vote('a', 'negative');
    });
    await act(async () => finishRead('positive'));

    await waitFor(() => expect(readLocalVotes().votes).toEqual([]));
    expect(mocks.submit.mock.calls).toEqual([['a', 'negative']]);
    // The replaced vote's read answered "already held", but it is no longer the vote to report on.
    expect(mocks.capture).not.toHaveBeenCalledWith('already_held', expect.anything(), expect.anything());
  });

  it('keeps a vote cast in place of one whose write finishes after it', async () => {
    vote('a');
    let finishWrite: () => void = () => {};
    mocks.submit.mockImplementationOnce(() => new Promise<void>(resolve => (finishWrite = resolve)));
    saveSignedIn();
    signInWithSpace();
    render(<LocalVotesSaver />);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledOnce());

    // The replacement's own save is held at its read, so the older write lands first.
    mocks.heldReads.set('a', new Promise(() => {}));
    act(() => {
      vote('a');
      vote('a', 'negative');
    });
    await act(async () => finishWrite());

    expect(readLocalVotes().votes).toMatchObject([{ entityId: 'a', direction: 'negative' }]);
  });

  // Copilot on #2785 (round 2): a failure belongs to the session it happened in.
  // Copilot on #2785 (round 3): votes bound to an account are that account's, sign-out or not.
  it('clears what a save left unsaved when its account signs out, so the next one cannot take it', async () => {
    vote('a');
    vote('b');
    mocks.submit.mockRejectedValueOnce(new Error('bundler down'));
    saveSignedIn();
    signInWithSpace();
    const { rerender } = render(<LocalVotesSaver />);
    await waitFor(() => expect(mocks.reportError).toHaveBeenCalled());

    mocks.authenticated = false;
    rerender(<LocalVotesSaver />);
    expect(readLocalVotes().votes).toEqual([]);
    expect(mocks.capture).toHaveBeenCalledWith('signed_out', expect.objectContaining({ entityId: 'a' }), 2);

    // The next account, through a save prompt: nothing of the last one's to publish.
    mocks.accountId = 'did:privy:next';
    saveSignedIn();
    signInWithSpace();
    rerender(<LocalVotesSaver />);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it('starts the next save afresh after a failed one and a sign-out, without its Retry', async () => {
    vote('a');
    mocks.submit.mockRejectedValueOnce(new Error('bundler down'));
    saveSignedIn();
    signInWithSpace();
    const { rerender } = render(<LocalVotesSaver />);
    await waitFor(() => expect(mocks.reportError).toHaveBeenCalled());

    mocks.authenticated = false;
    rerender(<LocalVotesSaver />);
    // Signed out, the visitor votes again on this device and saves through a prompt.
    vote('c');
    saveSignedIn();
    signInWithSpace();
    rerender(<LocalVotesSaver />);

    await waitFor(() => expect(readLocalVotes().votes).toEqual([]));
    expect(mocks.submit.mock.calls.at(-1)).toEqual(['c', 'positive']);
  });

  it('leaves a sign-in from another tab to that tab, rather than clearing the votes it is saving', () => {
    vote('a');
    // Signed in, with no attempt in this tab: the sign-in happened in another one.
    mocks.attempt = undefined;
    signInWithSpace();
    render(<LocalVotesSaver />);

    expect(readLocalVotes().votes).toHaveLength(1);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
