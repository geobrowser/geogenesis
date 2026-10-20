import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearLocalVotes, readLocalVotes } from '~/core/state/local-votes';
import { pendingActionsAtom } from '~/core/state/pending-actions';
import { closeSaveVotesPrompt } from '~/core/state/save-votes-prompt';

import { HeldVotesRunner } from '~/partials/held-votes-runner';

import { EntityVoteButtons } from './entity-vote-buttons';

const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({
  promptSignIn: vi.fn(),
  submitResponseAsync: vi.fn(),
  authReady: false,
  authenticated: false,
  smartAccount: null as unknown,
  personalSpace: { personalSpaceId: null as string | null, isRegistered: false, isLoading: false },
  responseSpaceId: null as string | null,
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.authReady, authenticated: mocks.authenticated }),
  useGeoLogin: () => ({ login: vi.fn() }),
}));
vi.mock('~/core/analytics', () => ({
  downvoted: vi.fn(),
  trackPrivyAuth: vi.fn(),
  upvoted: vi.fn(),
  voteCast: vi.fn(),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));
vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: () => ({
    submitResponse: vi.fn(),
    submitResponseAsync: mocks.submitResponseAsync,
    optimisticResponse: undefined,
    isResponseIndexingDelayed: false,
    isConnected: false,
    personalSpaceId: mocks.responseSpaceId,
  }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: mocks.smartAccount }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => mocks.personalSpace }));
vi.mock('~/core/state/pending-personal-space', () => ({ usePendingPersonalSpace: () => ({ isPending: false }) }));
vi.mock('~/core/io/queries', () => ({
  getClaimResponseSummaryPage: () => Effect.succeed([]),
  getEntityResponseCounts: () => Effect.succeed({ positive: 2, negative: 1 }),
  getEntityResponders: () => Effect.succeed([]),
  getSpaces: () => Effect.succeed([]),
  getUserEntityResponse: () => Effect.succeed(null),
}));
vi.mock('~/core/io/subgraph/fetch-profile', () => ({ fetchProfilesBySpaceIds: () => Effect.succeed([]) }));
vi.mock('~/core/responses/replay-viewer-response', () => ({
  readViewerResponseForReplay: () => Promise.resolve(null),
}));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null, isLoading: false }) }));
vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({ ClaimResponderAvatars: () => null }));

let store = createStore();
const queued = () => store.get(pendingActionsAtom);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>
        <HeldVotesRunner />
        {children}
      </QueryClientProvider>
    </JotaiProvider>
  );
}

const upvote = () => screen.getAllByRole('button').find(button => button.className.includes('group/vote'))!;
const buttons = () => screen.getAllByRole('button').filter(button => button.className.includes('group/vote'));

beforeEach(() => {
  store = createStore();
  mocks.promptSignIn.mockReset();
  mocks.submitResponseAsync.mockReset();
  mocks.submitResponseAsync.mockResolvedValue(undefined);
  mocks.authReady = false;
  mocks.authenticated = false;
  mocks.smartAccount = null;
  mocks.personalSpace = { personalSpaceId: null, isRegistered: false, isLoading: false };
  mocks.responseSpaceId = null;
  clearLocalVotes();
  closeSaveVotesPrompt();
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe('a vote pressed while sign-in is still resolving', () => {
  const renderButtons = () =>
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, { wrapper });

  it('never prompts a viewer who turns out to be signed in', async () => {
    mocks.authReady = true;
    mocks.authenticated = true;

    const view = renderButtons();
    fireEvent.click(upvote());

    expect(mocks.promptSignIn).not.toHaveBeenCalled();
    expect(readLocalVotes().votes).toEqual([]);

    mocks.smartAccount = { account: { address: '0xviewer' } };
    view.rerender(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />);

    await waitFor(() => expect(queued()).toHaveLength(1));
    expect(mocks.promptSignIn).not.toHaveBeenCalled();
    expect(readLocalVotes().votes).toEqual([]);
  });

  it('keeps the press on this device once signed out is known, rather than losing it', async () => {
    const view = renderButtons();
    fireEvent.click(upvote());

    expect(readLocalVotes().votes).toEqual([]);

    mocks.authReady = true;
    view.rerender(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />);

    await waitFor(() => expect(readLocalVotes().votes).toHaveLength(1));
    expect(mocks.promptSignIn).not.toHaveBeenCalled();
  });

  it('acts on the press once only, however many renders follow', async () => {
    const view = renderButtons();
    fireEvent.click(upvote());

    mocks.authReady = true;
    const rerender = () =>
      view.rerender(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />);
    rerender();
    rerender();
    rerender();

    await waitFor(() => expect(readLocalVotes().votes).toHaveLength(1));
  });

  it('takes the last side pressed while it waits', async () => {
    const view = renderButtons();
    fireEvent.click(upvote());
    fireEvent.click(buttons()[1]!);

    mocks.authReady = true;
    view.rerender(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />);

    await waitFor(() => expect(readLocalVotes().votes).toHaveLength(1));
    expect(readLocalVotes().votes[0]!.direction).toBe('negative');
  });

  it('leaves the arrows enabled while it waits', () => {
    renderButtons();

    for (const button of buttons()) expect(button).not.toBeDisabled();
  });
});

describe('a vote held across the page and sticky-header arrows', () => {
  function Page({ sticky }: { sticky: boolean }) {
    return (
      <>
        <EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />
        {sticky ? <EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" compact /> : null}
      </>
    );
  }

  const renderPage = () => {
    const view = render(<Page sticky />, { wrapper });
    return { rerender: (sticky: boolean) => view.rerender(<Page sticky={sticky} />) };
  };
  const pageArrows = () => buttons().slice(0, 2);
  const stickyArrows = () => buttons().slice(2, 4);

  it('carries out a press from the sticky header after it unmounts', async () => {
    const page = renderPage();
    fireEvent.click(stickyArrows()[0]!);
    page.rerender(false);

    mocks.authReady = true;
    page.rerender(false);

    await waitFor(() => expect(readLocalVotes().votes).toHaveLength(1));
    expect(readLocalVotes().votes[0]!.direction).toBe('positive');
    expect(queued()).toHaveLength(0);
  });

  it('casts one vote, not one toggling the other off, when both hold the same side', async () => {
    const page = renderPage();
    fireEvent.click(pageArrows()[0]!);
    fireEvent.click(stickyArrows()[0]!);

    mocks.authReady = true;
    page.rerender(true);

    await waitFor(() => expect(readLocalVotes().votes).toHaveLength(1));
    expect(readLocalVotes().votes[0]!.direction).toBe('positive');
  });

  it('takes the last side pressed, whichever set took it', async () => {
    const page = renderPage();
    fireEvent.click(stickyArrows()[0]!);
    fireEvent.click(pageArrows()[1]!);

    mocks.authReady = true;
    page.rerender(true);

    await waitFor(() => expect(readLocalVotes().votes).toHaveLength(1));
    expect(readLocalVotes().votes[0]!.direction).toBe('negative');
  });

  it('queues one write, for the last side pressed, for a viewer who turns out to be signed in', async () => {
    mocks.authReady = true;
    mocks.authenticated = true;
    const page = renderPage();
    fireEvent.click(pageArrows()[0]!);
    fireEvent.click(stickyArrows()[1]!);

    mocks.smartAccount = { account: { address: '0xviewer' } };
    page.rerender(true);

    await waitFor(() => expect(queued()).toEqual([expect.objectContaining({ intent: 'negative' })]));
    expect(readLocalVotes().votes).toEqual([]);
    expect(mocks.promptSignIn).not.toHaveBeenCalled();
  });
});
