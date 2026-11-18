import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EditorRequestLookupError, fetchActiveEditorRequest } from './fetch-proposed-editors';

const restFetchMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: {
    getConfig: () => ({ api: 'https://example.com/graphql', bundler: '', chainId: '19411', rpc: '' }),
  },
}));

vi.mock('../rest', async () => {
  const actual = await vi.importActual('../rest');
  return { ...actual, restFetch: (...args: unknown[]) => restFetchMock(...args) };
});

const SPACE = '00000000-0000-0000-0000-000000000999';
// Same id, two spellings — the matcher must normalize dashes/case.
const EDITOR_DASHLESS = '89c62a03eec70a8852093399fa897c2d';
const EDITOR_DASHED = '89c62a03-eec7-0a88-5209-3399fa897c2d';

function proposal(over: {
  proposalId: string;
  status?: 'PROPOSED' | 'EXECUTABLE' | 'ACCEPTED' | 'REJECTED';
  targetId?: string;
  endTime?: number;
  isVotingEnded?: boolean;
  actionType?: string;
  passed?: boolean;
  executeBy?: number;
}) {
  return {
    proposalId: over.proposalId,
    spaceId: SPACE,
    name: null,
    proposedBy: 'member-space',
    status: over.status ?? 'PROPOSED',
    votingMode: 'SLOW',
    actions: [{ actionType: over.actionType ?? 'ADD_EDITOR', targetId: over.targetId ?? EDITOR_DASHED }],
    userVote: null,
    quorum: { required: 1, current: 0, progress: 0, reached: over.passed ?? false },
    threshold: { required: '50%', current: 0, progress: 0, reached: over.passed ?? false },
    executeBy: over.executeBy ?? null,
    timing: {
      startTime: 0,
      endTime: over.endTime ?? 100,
      timeRemaining: null,
      isVotingEnded: over.isVotingEnded ?? false,
    },
    canExecute: over.passed ?? false,
    votes: { yes: 0, no: 0, abstain: 0, total: 0 },
  };
}

function mockProposals(proposals: ReturnType<typeof proposal>[]) {
  restFetchMock.mockImplementation(() => Effect.succeed({ proposals, nextCursor: null }));
}

describe('fetchActiveEditorRequest', () => {
  beforeEach(() => restFetchMock.mockReset());

  it('matches a request by normalized target id and reports voting state', async () => {
    mockProposals([proposal({ proposalId: 'p1', targetId: EDITOR_DASHED, isVotingEnded: true })]);

    await expect(fetchActiveEditorRequest(SPACE, EDITOR_DASHLESS)).resolves.toEqual({
      proposalId: 'p1',
      isVotingEnded: true,
      canExecute: false,
    });

    const { path } = restFetchMock.mock.calls[0][0] as { path: string };
    expect(path).toContain('actionTypes=AddEditor');
  });

  it('returns null when no request targets this member', async () => {
    mockProposals([proposal({ proposalId: 'p1', targetId: '11111111111111111111111111111111' })]);

    await expect(fetchActiveEditorRequest(SPACE, EDITOR_DASHLESS)).resolves.toBeNull();
  });

  it('ignores resolved proposals and keeps only active ones', async () => {
    mockProposals([
      proposal({ proposalId: 'rejected', status: 'REJECTED' }),
      proposal({ proposalId: 'accepted', status: 'ACCEPTED' }),
    ]);

    await expect(fetchActiveEditorRequest(SPACE, EDITOR_DASHLESS)).resolves.toBeNull();
  });

  it('returns the most recent matching request', async () => {
    mockProposals([
      proposal({ proposalId: 'old', endTime: 100, isVotingEnded: true }),
      proposal({ proposalId: 'new', endTime: 500, isVotingEnded: false, status: 'PROPOSED' }),
    ]);

    await expect(fetchActiveEditorRequest(SPACE, EDITOR_DASHLESS)).resolves.toEqual({
      proposalId: 'new',
      isVotingEnded: false,
      canExecute: false,
    });
  });

  it('says whether an ended request can still execute, by the governance rule', async () => {
    const now = Math.floor(Date.now() / 1000);
    const read = (over: { passed: boolean; executeBy?: number }) => {
      mockProposals([proposal({ proposalId: 'p1', status: 'EXECUTABLE', isVotingEnded: true, ...over })]);
      return fetchActiveEditorRequest(SPACE, EDITOR_DASHLESS);
    };
    await expect(read({ passed: true, executeBy: now + 3600 })).resolves.toMatchObject({ canExecute: true });
    await expect(read({ passed: true, executeBy: now - 60 })).resolves.toMatchObject({ canExecute: false });
    await expect(read({ passed: false })).resolves.toMatchObject({ canExecute: false });
  });

  it('reads a failed or undecodable lookup as none, or throws when strict', async () => {
    restFetchMock.mockImplementation(() => Effect.fail(new Error('down')));
    await expect(fetchActiveEditorRequest(SPACE, EDITOR_DASHLESS)).resolves.toBeNull();
    await expect(fetchActiveEditorRequest(SPACE, EDITOR_DASHLESS, { strict: true })).rejects.toBeInstanceOf(
      EditorRequestLookupError
    );
    restFetchMock.mockImplementation(() => Effect.succeed({ nope: true }));
    await expect(fetchActiveEditorRequest(SPACE, EDITOR_DASHLESS)).resolves.toBeNull();
    await expect(fetchActiveEditorRequest(SPACE, EDITOR_DASHLESS, { strict: true })).rejects.toBeInstanceOf(
      EditorRequestLookupError
    );
  });
});
