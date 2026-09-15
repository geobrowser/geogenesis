import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProposalCommentAttribution } from './use-proposal-comment-attribution';

const PROPOSAL_ID = 'aa11bb22cc33dd44ee55ff6677889900';
const SPACE_ID = 'ffeeddccbbaa99887766554433221100';
const OTHER_SPACE_ID = '00112233445566778899aabbccddeeff';
const EDITOR_SPACE_ID = '4cd9cca5530b69056aead853c8088e7e';
const MEMBER_SPACE_ID = 'cc0bf85a27c217d75993bc785a15b198';

const fetchProposal = vi.fn();
const getMemberSpaceIdsForSpace = vi.fn();

vi.mock('~/core/io/subgraph/fetch-proposal', () => ({
  fetchProposal: (options: { id: string }) => fetchProposal(options),
}));

vi.mock('~/core/access/space-access', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/access/space-access')>()),
  getMemberSpaceIdsForSpace: (spaceId: string, ids: string[]) => getMemberSpaceIdsForSpace(spaceId, ids),
}));

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function proposal(spaceId = SPACE_ID) {
  return {
    space: { id: spaceId },
    proposalVotes: { nodes: [{ accountId: EDITOR_SPACE_ID, vote: 'REJECT' }] },
  };
}

function render(overrides: Partial<Parameters<typeof useProposalCommentAttribution>[0]> = {}) {
  return renderHook(
    () =>
      useProposalCommentAttribution({
        entityId: PROPOSAL_ID,
        spaceId: SPACE_ID,
        authorSpaceIds: [EDITOR_SPACE_ID, MEMBER_SPACE_ID],
        editorSpaceIds: new Set([EDITOR_SPACE_ID]),
        enabled: true,
        ...overrides,
      }),
    { wrapper }
  );
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchProposal.mockReset();
  getMemberSpaceIdsForSpace.mockReset();
  getMemberSpaceIdsForSpace.mockReturnValue(Effect.succeed(new Set([MEMBER_SPACE_ID])));
});

describe('useProposalCommentAttribution', () => {
  it('joins the passed editors, the fetched members and the votes', async () => {
    fetchProposal.mockResolvedValue(proposal());

    const { result } = render();

    await waitFor(() => expect(result.current.get(EDITOR_SPACE_ID)).toEqual({ role: 'editor', vote: 'REJECT' }));
    expect(result.current.get(MEMBER_SPACE_ID)).toEqual({ role: 'member', vote: null });
  });

  /**
   * Every surface that renders comments mounts this hook. Membership is a request per comment author,
   * and nothing outside a proposal badge wants it, so an entity that is not a proposal must not pay.
   */
  it('asks nothing about membership for an entity that is not a proposal', async () => {
    fetchProposal.mockResolvedValue(null);

    const { result } = render();

    await waitFor(() => expect(fetchProposal).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
    expect(getMemberSpaceIdsForSpace).not.toHaveBeenCalled();
  });

  it('asks nothing at all while there are no comments to badge', async () => {
    fetchProposal.mockResolvedValue(proposal());

    const { result } = render({ enabled: false });

    await waitFor(() => expect(result.current.size).toBe(0));
    expect(fetchProposal).not.toHaveBeenCalled();
    expect(getMemberSpaceIdsForSpace).not.toHaveBeenCalled();
  });

  /**
   * The editor set is gathered by the caller against the space it is reading. For a proposal entity
   * that is the proposal's own space — the premise the feature rests on — but if the two ever
   * disagree those ids answer a question about a different space, and a wrong role on a named person
   * is worse than no badge. The vote survives, because it is the proposal's own record.
   */
  it('drops editor roles when the proposal lives in a different space than the one being read', async () => {
    fetchProposal.mockResolvedValue(proposal(OTHER_SPACE_ID));

    const { result } = render();

    await waitFor(() => expect(result.current.get(EDITOR_SPACE_ID)).toEqual({ role: null, vote: 'REJECT' }));
  });

  it('asks about membership in the proposal space, for the comment authors', async () => {
    fetchProposal.mockResolvedValue(proposal());

    render();

    await waitFor(() => expect(getMemberSpaceIdsForSpace).toHaveBeenCalled());
    const [askedSpaceId, askedIds] = getMemberSpaceIdsForSpace.mock.calls[0];
    expect(askedSpaceId).toBe(SPACE_ID);
    expect([...askedIds].sort()).toEqual([EDITOR_SPACE_ID, MEMBER_SPACE_ID].sort());
  });
});
