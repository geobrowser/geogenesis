import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useProposalCommentAttribution } from './use-proposal-comment-attribution';

const PROPOSAL_ID = 'aa11bb22cc33dd44ee55ff6677889900';
const SPACE_ID = 'ffeeddccbbaa99887766554433221100';
const OTHER_SPACE_ID = '00112233445566778899aabbccddeeff';
const EDITOR_SPACE_ID = '4cd9cca5530b69056aead853c8088e7e';
const MEMBER_SPACE_ID = 'cc0bf85a27c217d75993bc785a15b198';
const OTHER_EDITOR_SPACE_ID = 'b7e3a1d95c2f48e0a6d31f7c8b04e592';

const fetchProposal = vi.fn();

// The app runs these under wagmi and jotai providers; here they are the two inputs being varied.
let personalSpaceId: string | null = EDITOR_SPACE_ID;
let optimisticVote: 'ACCEPT' | 'REJECT' | 'ABSTAIN' | undefined;

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId, isLoading: false }),
}));

vi.mock('~/partials/governance/optimistic-voted-atom', () => ({
  useOptimisticVoteChoice: () => optimisticVote,
}));

vi.mock('~/core/io/subgraph/fetch-proposal', () => ({
  fetchProposal: (options: { id: string }) => fetchProposal(options),
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
        editorSpaceIds: new Set([EDITOR_SPACE_ID]),
        memberSpaceIds: new Set([MEMBER_SPACE_ID]),
        isLoadingRoles: false,
        isRolesError: false,
        enabled: true,
        ...overrides,
      }),
    { wrapper }
  );
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchProposal.mockReset();
  personalSpaceId = EDITOR_SPACE_ID;
  optimisticVote = undefined;
});

describe('useProposalCommentAttribution', () => {
  it('joins the passed editors, the fetched members and the votes', async () => {
    fetchProposal.mockResolvedValue(proposal());

    const { result } = render();

    await waitFor(() => expect(result.current.get(EDITOR_SPACE_ID)).toEqual({ role: 'editor', vote: 'REJECT' }));
    expect(result.current.get(MEMBER_SPACE_ID)).toEqual({ role: 'member', vote: null });
  });

  it('says nothing about an entity that is not a proposal', async () => {
    fetchProposal.mockResolvedValue(null);

    const { result } = render();

    await waitFor(() => expect(fetchProposal).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
  });

  it('asks nothing at all while there are no comments to badge', async () => {
    fetchProposal.mockResolvedValue(proposal());

    const { result } = render({ enabled: false });

    await waitFor(() => expect(result.current.size).toBe(0));
    expect(fetchProposal).not.toHaveBeenCalled();
  });

  /**
   * The editor set is gathered by the caller against the space it is reading. For a proposal entity
   * that is the proposal's own space — the premise the feature rests on — but if the two ever
   * disagree those ids answer a question about a different space, and a wrong role on a named person
   * is worse than no badge. The vote survives, because it is the proposal's own record.
   */
  it('drops both roles when the proposal lives in a different space than the one being read', async () => {
    fetchProposal.mockResolvedValue(proposal(OTHER_SPACE_ID));

    const { result } = render();

    // The vote survives — it is the proposal's own record — but claims no role behind it.
    await waitFor(() => expect(result.current.get(EDITOR_SPACE_ID)).toEqual({ role: null, vote: 'REJECT' }));
    // Membership came from the same request as editorship, so it answers about the same wrong space.
    // A commenter who is merely a member would otherwise still be labelled "Member" here.
    expect(result.current.get(MEMBER_SPACE_ID)).toBeUndefined();
  });

  /**
   * The roles and the votes resolve independently, so a map published before both role lookups
   * answer shows a voter as a bare "Rejected" and then as "Editor · Rejected" a beat later — the
   * page correcting itself about a named person, which is what the badge exists to avoid.
   */
  it('draws nothing while a role lookup is still in flight', async () => {
    fetchProposal.mockResolvedValue(proposal());

    const { result, rerender } = renderHook(
      (props: { isLoadingRoles: boolean }) =>
        useProposalCommentAttribution({
          entityId: PROPOSAL_ID,
          spaceId: SPACE_ID,
          editorSpaceIds: new Set([EDITOR_SPACE_ID]),
          memberSpaceIds: new Set([MEMBER_SPACE_ID]),
          isRolesError: false,
          enabled: true,
          ...props,
        }),
      { wrapper, initialProps: { isLoadingRoles: false } }
    );

    // Every input has landed — so an empty map after the flip is the hold, not a race.
    await waitFor(() => expect(result.current.size).toBeGreaterThan(0));

    rerender({ isLoadingRoles: true });

    expect(result.current.size).toBe(0);
  });

  /**
   * A vote is a round trip through the chain and the indexer away from being readable back, and the
   * reader is looking at their own comment when they cast it.
   */
  it('shows the vote the reader just cast, before it can be read back', async () => {
    fetchProposal.mockResolvedValue(proposal());
    optimisticVote = 'ACCEPT';

    const { result } = render();

    await waitFor(() => expect(result.current.get(EDITOR_SPACE_ID)).toEqual({ role: 'editor', vote: 'ACCEPT' }));
  });

  it("leaves another editor's recorded vote alone when the reader votes", async () => {
    fetchProposal.mockResolvedValue({
      space: { id: SPACE_ID },
      proposalVotes: { nodes: [{ accountId: OTHER_EDITOR_SPACE_ID, vote: 'REJECT' }] },
    });
    optimisticVote = 'ACCEPT';

    const { result } = render({ editorSpaceIds: new Set([EDITOR_SPACE_ID, OTHER_EDITOR_SPACE_ID]) });

    await waitFor(() => expect(result.current.get(EDITOR_SPACE_ID)).toEqual({ role: 'editor', vote: 'ACCEPT' }));
    // The overlay replaces the reader's own vote, not the whole record.
    expect(result.current.get(OTHER_EDITOR_SPACE_ID)).toEqual({ role: 'editor', vote: 'REJECT' });
  });

  /**
   * Empty role sets are how "nobody here holds a role" looks, so publishing them when the lookup
   * failed would unbadge every editor on the page and leave their votes reading as a bare
   * "Rejected" — stating something false rather than declining to state anything.
   */
  it('draws nothing when the role lookup failed, rather than reporting no roles', async () => {
    fetchProposal.mockResolvedValue(proposal());

    const { result, rerender } = renderHook(
      (props: { isRolesError: boolean }) =>
        useProposalCommentAttribution({
          entityId: PROPOSAL_ID,
          spaceId: SPACE_ID,
          // Empty, as a failed lookup leaves them — the vote is what would still get published.
          editorSpaceIds: new Set<string>(),
          memberSpaceIds: new Set<string>(),
          isLoadingRoles: false,
          enabled: true,
          ...props,
        }),
      { wrapper, initialProps: { isRolesError: false } }
    );

    // The vote alone does populate the map, badging the voter a bare "Rejected".
    await waitFor(() => expect(result.current.get(EDITOR_SPACE_ID)).toEqual({ role: null, vote: 'REJECT' }));

    rerender({ isRolesError: true });

    expect(result.current.size).toBe(0);
  });
});
