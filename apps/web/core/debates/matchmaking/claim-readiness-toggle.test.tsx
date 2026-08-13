import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ReactElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entityResponseIndexingQueryKey } from '~/core/responses/entity-response';

import type { DebateClaimSummary, MatchmakingReadiness } from '../api';
import { ClaimReadinessToggle } from './claim-readiness-toggle';

const mocks = vi.hoisted(() => ({
  joinMutateAsync: vi.fn(),
  joinReset: vi.fn(),
  leaveMutateAsync: vi.fn(),
  authReady: true,
  authenticated: true,
  accountKey: 'account-1' as string | null,
}));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ ready: mocks.authReady, authenticated: mocks.authenticated, accountKey: mocks.accountKey }),
  useJoinDebateQueue: () => ({
    mutateAsync: mocks.joinMutateAsync,
    reset: mocks.joinReset,
    isPending: false,
    error: null,
  }),
  useLeaveDebateQueue: () => ({ mutateAsync: mocks.leaveMutateAsync, isPending: false, error: null }),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: 'profile-space-1', isRegistered: true }),
}));

const SPACE_ID = '019fedae-72b6-7ab2-927a-df044d57c566';
const CLAIM_ID = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';

const claim: DebateClaimSummary = {
  id: 'debate-claim-1',
  space_id: SPACE_ID,
  claim_entity_id: CLAIM_ID,
  claim: 'Chips are better than fries',
  description: null,
};

function readiness(overrides: Partial<MatchmakingReadiness> = {}): MatchmakingReadiness {
  return {
    response_kind: 'stance',
    viewer_response: { position: true, position_label: 'Agree' },
    viewer_debate_ready: false,
    readiness_disabled_reason: null,
    ...overrides,
  };
}

const toggle = () => screen.getByRole('switch', { name: 'Ready to debate this claim' });

function renderToggle(
  readinessState: MatchmakingReadiness = readiness(),
  indexingState: unknown = idleIndexingState(),
  props: { activeDebate?: boolean } = {}
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(
    entityResponseIndexingQueryKey('profile-space-1', CLAIM_ID, SPACE_ID, readinessState.response_kind),
    indexingState
  );

  return { queryClient, ...render(element(readinessState, queryClient, props)) };
}

function element(
  readinessState: MatchmakingReadiness,
  queryClient: QueryClient,
  props: { activeDebate?: boolean } = {}
): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <ClaimReadinessToggle claim={claim} readiness={readinessState} {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.joinMutateAsync.mockReset();
  mocks.joinMutateAsync.mockResolvedValue(queueResponse(true));
  mocks.joinReset.mockReset();
  mocks.leaveMutateAsync.mockReset();
  mocks.leaveMutateAsync.mockResolvedValue(queueResponse(false));
  mocks.authReady = true;
  mocks.authenticated = true;
  mocks.accountKey = 'account-1';
});

afterEach(cleanup);

describe('ClaimReadinessToggle', () => {
  it('stands the viewer up once they have a response', async () => {
    renderToggle();

    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledWith({ claimId: CLAIM_ID }));
  });

  it('stands the viewer down again without touching their response', async () => {
    renderToggle(readiness({ viewer_debate_ready: true }));

    fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    await waitFor(() => expect(mocks.leaveMutateAsync).toHaveBeenCalledWith({ claimId: CLAIM_ID }));
  });

  // The position is an on-chain response, so readiness cannot be turned on before there is one.
  // The reason is shown rather than left in a `title`, which never appears on touch.
  it('cannot be turned on before the viewer has responded, and says why', () => {
    renderToggle(readiness({ viewer_response: null }));

    expect(toggle()).toBeDisabled();
    expect(screen.getByText('Respond to this claim to debate it.')).toBeInTheDocument();
    fireEvent.click(toggle());
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();
  });

  // The whole point of the shared readiness machine: publishing a response used to disable this
  // switch and say "Publishing your response…" for the minute or so indexing took.
  it('moves immediately while the response is still publishing, without calling geo-chat', () => {
    renderToggle(readiness({ viewer_response: null }), indexing('positive'));

    expect(toggle()).toBeEnabled();
    expect(screen.queryByText(/publishing your response/i)).not.toBeInTheDocument();

    fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();
  });

  it('sends the held readiness exactly once, after geo-chat confirms the response', async () => {
    const view = renderToggle(readiness({ viewer_response: null }), indexing('positive'));

    fireEvent.click(toggle());
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();

    const responded = readiness({ viewer_response: { position: true, position_label: 'Agree' } });
    view.rerender(element(responded, view.queryClient));

    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledTimes(1));
    view.rerender(element(responded, view.queryClient));
    expect(mocks.joinMutateAsync).toHaveBeenCalledTimes(1);
  });

  // The response snapshot is retired the moment geo-chat reports the position — and the retiring
  // component is the card, not the switch. Watching the run past that point dropped the intent at
  // the instant it came good, which is the switch flicking itself off just before the card
  // resettled into "My positions".
  it('keeps the switch on when the card remounts after the response snapshot was retired', async () => {
    const view = renderToggle(readiness({ viewer_response: null }), indexing('positive'));

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    view.unmount();

    // The card retires the snapshot once geo-chat confirms, then the list re-sorts and remounts it
    // in "My positions" — so the switch comes back to a run that is already gone.
    view.queryClient.setQueryData(
      entityResponseIndexingQueryKey('profile-space-1', CLAIM_ID, SPACE_ID, 'stance'),
      idleIndexingState()
    );
    render(element(readiness({ viewer_response: { position: true, position_label: 'Agree' } }), view.queryClient));

    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledTimes(1));
  });

  // Privy reports signed-out until it rehydrates. A card remounting through that window — which is
  // what the hub list does when a claim changes section — must not read it as a sign-out.
  it('holds the intent through an unsettled auth read rather than discarding it', async () => {
    const view = renderToggle(readiness({ viewer_response: null }), indexing('positive'));

    fireEvent.click(toggle());

    mocks.authReady = false;
    mocks.authenticated = false;
    mocks.accountKey = null;
    view.rerender(element(readiness({ viewer_response: null }), view.queryClient));

    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();

    mocks.authReady = true;
    mocks.authenticated = true;
    mocks.accountKey = 'account-1';
    view.rerender(
      element(readiness({ viewer_response: { position: true, position_label: 'Agree' } }), view.queryClient)
    );

    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledTimes(1));
  });

  it('still discards the intent once a settled sign-out is confirmed', () => {
    const view = renderToggle(readiness({ viewer_response: null }), indexing('positive'));

    fireEvent.click(toggle());

    mocks.authenticated = false;
    mocks.accountKey = null;
    view.rerender(element(readiness({ viewer_response: null }), view.queryClient));

    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();
  });

  it('cancels held readiness when the switch is turned back off before it is sent', () => {
    renderToggle(readiness({ viewer_response: null }), indexing('positive'));

    fireEvent.click(toggle());
    fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();
  });

  it('keeps a held readiness intent when the card unmounts and comes back', async () => {
    const view = renderToggle(readiness({ viewer_response: null }), indexing('positive'));

    fireEvent.click(toggle());
    view.unmount();

    render(element(readiness({ viewer_response: null }), view.queryClient));
    expect(toggle()).toHaveAttribute('aria-checked', 'true');

    await act(async () => {
      view.queryClient.setQueryData(
        entityResponseIndexingQueryKey('profile-space-1', CLAIM_ID, SPACE_ID, 'stance'),
        indexing('positive')
      );
    });
    cleanup();

    render(element(readiness({ viewer_response: { position: true, position_label: 'Agree' } }), view.queryClient));
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledTimes(1));
  });

  // Standing yourself down reports `user_disabled`. It is the normal off state, not a blocker, so
  // it must neither be shown as a reason nor prevent standing back up.
  it('can be turned back on after the viewer stood themselves down', async () => {
    renderToggle(readiness({ readiness_disabled_reason: 'user_disabled' }));

    expect(screen.queryByText('user_disabled')).not.toBeInTheDocument();
    expect(toggle()).toBeEnabled();

    fireEvent.click(toggle());

    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledWith({ claimId: CLAIM_ID }));
  });

  // Other reasons explain the current state but still don't block turning readiness back on.
  it('explains a server reason without blocking the toggle', () => {
    renderToggle(readiness({ readiness_disabled_reason: 'claim_response_kind_changed' }));

    expect(
      screen.getByText('This claim’s response type changed. Respond and enable Debate again.')
    ).toBeInTheDocument();
    expect(toggle()).toBeEnabled();
  });

  it('blocks readiness on a claim that is already being debated', () => {
    renderToggle(readiness(), idleIndexingState(), { activeDebate: true });

    expect(toggle()).toBeDisabled();
    expect(screen.getByText('This claim is being debated right now.')).toBeInTheDocument();
  });

  it('still lets a ready viewer stand down while a reason is present', async () => {
    renderToggle(
      readiness({ viewer_debate_ready: true, readiness_disabled_reason: 'claim_response_validation_failed' })
    );

    fireEvent.click(toggle());

    await waitFor(() => expect(mocks.leaveMutateAsync).toHaveBeenCalledWith({ claimId: CLAIM_ID }));
  });

  it('rolls the switch back and shows a failed readiness change', async () => {
    mocks.joinMutateAsync.mockRejectedValueOnce(new Error('Response is no longer active.'));
    renderToggle();

    fireEvent.click(toggle());

    expect(await screen.findByText('Response is no longer active.')).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });
});

function idleIndexingState() {
  return { status: 'idle' as const, pending: null, runId: null };
}

function indexing(expectedResponse: 'positive' | 'negative') {
  return {
    status: 'reconciling' as const,
    pending: {
      entityId: CLAIM_ID,
      expectedResponse,
      personalSpaceId: 'profile-space-1',
      responseKind: 'stance' as const,
      spaceId: SPACE_ID,
    },
    runId: 'response-run-1',
  };
}

function queueResponse(viewerDebateReady: boolean) {
  return {
    claim: {
      id: 'debate-claim-1',
      space_id: SPACE_ID,
      claim_entity_id: CLAIM_ID,
      claim: 'Chips are better than fries',
      description: null,
      response_kind: 'stance' as const,
      viewer_response: { position: true, position_label: 'Agree' },
      viewer_debate_ready: viewerDebateReady,
      readiness_disabled_reason: null,
      readiness_changed_at: null,
      online_choices: [],
      active_match: null,
      active_debate: null,
      created_at: '2026-08-06T00:00:00.000Z',
      updated_at: '2026-08-06T00:00:00.000Z',
    },
    match: null,
  };
}
