import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ReactElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entityResponseIndexingQueryKey } from '~/core/responses/entity-response';

import { type DebateClaim, GeoChatRequestError } from './api';
import { ClaimDebateReadiness } from './claim-debate-readiness';

const mocks = vi.hoisted(() => ({
  joinMutateAsync: vi.fn(),
  joinReset: vi.fn(),
  leaveMutateAsync: vi.fn(),
  responseKinds: [] as Array<'stance' | 'veracity' | null>,
  authReady: true,
  authenticated: true,
  accountKey: 'account-1' as string | null,
}));

vi.mock('./hooks', () => ({
  // Mirrors the real key factory: the readiness machine refetches these families before it
  // retries a `claim_response_required`.
  debateQueryKeys: {
    matchmakingClaimsRoot: (accountKey: string | null) =>
      ['debates', 'account', accountKey, 'matchmaking-claims'] as const,
    matches: (accountKey: string | null) => ['debates', 'account', accountKey, 'matches'] as const,
  },
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

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: ({ responseKind }: { responseKind: 'stance' | 'veracity' | null }) => {
    mocks.responseKinds.push(responseKind);
    return <div data-testid="entity-response-buttons">Entity response buttons</div>;
  },
}));

beforeEach(() => {
  mocks.joinMutateAsync.mockReset();
  mocks.joinMutateAsync.mockReturnValue(deferred().promise);
  mocks.joinReset.mockReset();
  mocks.leaveMutateAsync.mockReset();
  mocks.leaveMutateAsync.mockReturnValue(deferred(queueResponse(false)).promise);
  mocks.responseKinds.length = 0;
  mocks.authReady = true;
  mocks.authenticated = true;
  mocks.accountKey = 'account-1';
});

afterEach(cleanup);

describe('ClaimDebateReadiness', () => {
  it('shows the disabled Debate switch until the user responds', () => {
    renderReadiness(claim({ viewer_response: null }));

    expect(screen.getByTestId('entity-response-buttons')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Debate' })).toBeDisabled();
    expect(screen.queryByText(/join debate|cancel join|check again/i)).not.toBeInTheDocument();
  });

  it('places the response controls and Debate switch in one action row', () => {
    renderReadiness(claim());

    const actionRow = screen.getByTestId('entity-response-buttons').parentElement;
    expect(actionRow).toBe(screen.getByRole('switch', { name: 'Debate' }).parentElement);
    expect(actionRow).toHaveClass('flex', 'items-center', 'gap-4');
  });

  it('optimistically enables persisted readiness through the Debate switch', async () => {
    renderReadiness(claim({ viewer_response: { position: false, position_label: 'Disagree' } }));

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.joinMutateAsync).toHaveBeenCalledWith({ claimId: 'claim-1' });
  });

  it('hands control back to a newer backend disable after the join is confirmed', async () => {
    const join = deferred();
    mocks.joinMutateAsync.mockReturnValueOnce(join.promise);
    const view = renderReadiness(claim());

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledOnce());

    await act(() => join.resolve(queueResponse(true)));
    view.rerender(readiness(claim({ viewer_debate_ready: true }), view.queryClient));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Debate' })).not.toHaveAttribute('aria-busy'));

    view.rerender(readiness(claim({ viewer_debate_ready: false }), view.queryClient));

    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
  });

  it('stays clickable while joining and serializes a later leave', async () => {
    const join = deferred();
    mocks.joinMutateAsync.mockReturnValueOnce(join.promise);
    renderReadiness(claim());

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    fireEvent.click(toggle);

    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledOnce());
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAttribute('aria-busy', 'true');
    expect(toggle).toBeEnabled();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(mocks.leaveMutateAsync).not.toHaveBeenCalled();

    await act(() => join.resolve());

    await waitFor(() => expect(mocks.leaveMutateAsync).toHaveBeenCalledOnce());
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('stays clickable while leaving and serializes a later join', async () => {
    const leave = deferred(queueResponse(false));
    mocks.leaveMutateAsync.mockReturnValueOnce(leave.promise);
    renderReadiness(claim({ viewer_debate_ready: true }));

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    fireEvent.click(toggle);

    expect(mocks.leaveMutateAsync).toHaveBeenCalledOnce();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAttribute('aria-busy', 'true');
    expect(toggle).toBeEnabled();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();

    await act(() => leave.resolve());

    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledOnce());
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('collapses rapid reversals to the final desired readiness', async () => {
    const join = deferred();
    mocks.joinMutateAsync.mockReturnValueOnce(join.promise);
    renderReadiness(claim());

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledOnce());

    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await act(() => join.resolve());

    await waitFor(() => expect(toggle).not.toHaveAttribute('aria-busy'));
    expect(mocks.joinMutateAsync).toHaveBeenCalledOnce();
    expect(mocks.leaveMutateAsync).not.toHaveBeenCalled();
  });

  it('preserves an in-flight readiness intent across client-side navigation', async () => {
    const join = deferred();
    mocks.joinMutateAsync.mockReturnValueOnce(join.promise);
    const view = renderReadiness(claim());

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledOnce());
    view.unmount();

    const remounted = render(readiness(claim(), view.queryClient));
    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-busy', 'true');

    await act(() => join.resolve());

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Debate' })).not.toHaveAttribute('aria-busy'));
    expect(mocks.joinMutateAsync).toHaveBeenCalledOnce();
    remounted.rerender(readiness(claim({ viewer_debate_ready: true }), view.queryClient));
    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'true');
  });

  it('preserves the final reversal across client-side navigation', async () => {
    const join = deferred();
    const leave = deferred(queueResponse(false));
    mocks.joinMutateAsync.mockReturnValueOnce(join.promise);
    mocks.leaveMutateAsync.mockReturnValueOnce(leave.promise);
    const view = renderReadiness(claim());

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledOnce());
    fireEvent.click(toggle);
    view.unmount();

    render(readiness(claim(), view.queryClient));
    await act(() => join.resolve());

    await waitFor(() => expect(mocks.leaveMutateAsync).toHaveBeenCalledOnce());
    await act(() => leave.resolve());
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Debate' })).not.toHaveAttribute('aria-busy'));
    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
  });

  it('starts one request when duplicate controls share the same readiness intent', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ClaimDebateReadiness debateClaim={claim()} entityId="claim-1" spaceId="space-1" canEnable compact />
        <ClaimDebateReadiness debateClaim={claim()} entityId="claim-1" spaceId="space-1" canEnable compact />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getAllByRole('switch', { name: 'Debate' })[0]);

    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledOnce());
    expect(screen.getAllByRole('switch', { name: 'Debate' })[0]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByRole('switch', { name: 'Debate' })[1]).toHaveAttribute('aria-checked', 'true');
  });

  it('turns persisted readiness off through the same switch', () => {
    renderReadiness(claim({ viewer_debate_ready: true }));

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Waiting for someone with the opposite response.')).not.toBeInTheDocument();
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(mocks.leaveMutateAsync).toHaveBeenCalledWith({ claimId: 'claim-1' });
  });

  it('allows optimistic readiness before indexing without calling geo-chat', () => {
    renderReadiness(claim({ viewer_response: null }), indexing('positive'));

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    expect(toggle).toBeEnabled();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText(/processing response|join debate|cancel join|check again/i)).not.toBeInTheDocument();
  });

  it('submits readiness exactly once after geo-chat confirms the expected response', async () => {
    const view = renderReadiness(claim({ viewer_response: null }), indexing('negative'));

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();

    view.rerender(
      readiness(claim({ viewer_response: { position: false, position_label: 'Disagree' } }), view.queryClient)
    );

    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledTimes(1));
    view.rerender(
      readiness(claim({ viewer_response: { position: false, position_label: 'Disagree' } }), view.queryClient)
    );
    expect(mocks.joinMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('turns the optimistic switch off to cancel readiness before confirmation', () => {
    renderReadiness(claim({ viewer_response: null }), indexing('positive'));

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();
  });

  it('clears optimistic readiness when the response transaction fails', async () => {
    const view = renderReadiness(claim({ viewer_response: null }), indexing('positive'));
    const toggle = screen.getByRole('switch', { name: 'Debate' });
    fireEvent.click(toggle);

    await act(async () => {
      view.queryClient.setQueryData(
        entityResponseIndexingQueryKey('profile-space-1', 'claim-1', 'space-1', 'stance'),
        idleIndexingState()
      );
    });

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toBeDisabled();
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();
  });

  it('turns readiness off immediately when the response is optimistically withdrawn', () => {
    renderReadiness(claim({ viewer_debate_ready: true }), indexingClear());

    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText('Waiting for someone with the opposite response.')).not.toBeInTheDocument();
    expect(mocks.leaveMutateAsync).not.toHaveBeenCalled();
  });

  it('refetches and retries once when geo-chat has not observed the response yet', async () => {
    mocks.joinMutateAsync.mockRejectedValueOnce(
      new GeoChatRequestError('Respond before debating', 'claim_response_required', 409)
    );
    renderReadiness(claim());

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));

    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledTimes(2));
    expect(mocks.joinReset).toHaveBeenCalledOnce();
    expect(screen.queryByText('Respond before debating', { selector: '.text-red-01' })).not.toBeInTheDocument();
  });

  it('does not retry claim_response_required after the user switches Debate off', async () => {
    const join = deferred();
    mocks.joinMutateAsync.mockReturnValueOnce(join.promise);
    renderReadiness(claim());

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledOnce());
    fireEvent.click(toggle);

    await act(() => join.reject(new GeoChatRequestError('Respond before debating', 'claim_response_required', 409)));

    await waitFor(() => expect(toggle).not.toHaveAttribute('aria-busy'));
    expect(mocks.joinMutateAsync).toHaveBeenCalledOnce();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText('Respond before debating')).not.toBeInTheDocument();
  });

  it('clears readiness intent when a validation refetch removes the server response', async () => {
    mocks.joinMutateAsync.mockRejectedValueOnce(
      new GeoChatRequestError('Respond before debating', 'claim_response_required', 409)
    );
    const view = renderReadiness(claim());

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));
    view.rerender(readiness(claim({ viewer_response: null }), view.queryClient));

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false')
    );
    expect(mocks.joinMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('retires an indexed response after the debate payload confirms it', async () => {
    const view = renderReadiness(claim(), indexed('positive'));

    await waitFor(() =>
      expect(
        view.queryClient.getQueryData(entityResponseIndexingQueryKey('profile-space-1', 'claim-1', 'space-1', 'stance'))
      ).toEqual(idleIndexingState())
    );
  });

  it('clears optimistic readiness and surfaces non-transient queue errors', async () => {
    mocks.joinMutateAsync.mockRejectedValueOnce(new Error('Queue unavailable'));
    renderReadiness(claim());

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));

    await waitFor(() => expect(screen.getByText('Queue unavailable')).toBeInTheDocument());
    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
  });

  it('preserves queue failure feedback across client-side navigation', async () => {
    const join = deferred();
    mocks.joinMutateAsync.mockReturnValueOnce(join.promise);
    const view = renderReadiness(claim());

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledOnce());
    view.unmount();
    await act(() => join.reject(new Error('Queue unavailable')));

    render(readiness(claim(), view.queryClient));

    expect(await screen.findByText('Queue unavailable')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
  });

  it('rolls a failed leave back to the confirmed ready state', async () => {
    mocks.leaveMutateAsync.mockRejectedValueOnce(new Error('Leave unavailable'));
    renderReadiness(claim({ viewer_debate_ready: true }));

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));

    await waitFor(() => expect(screen.getByText('Leave unavailable')).toBeInTheDocument());
    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'true');
  });

  it('rolls back to a newly confirmed join when the serialized leave fails', async () => {
    const join = deferred();
    const leave = deferred(queueResponse(false));
    mocks.joinMutateAsync.mockReturnValueOnce(join.promise);
    mocks.leaveMutateAsync.mockReturnValueOnce(leave.promise);
    renderReadiness(claim());

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledOnce());
    fireEvent.click(toggle);
    await act(() => join.resolve());
    await waitFor(() => expect(mocks.leaveMutateAsync).toHaveBeenCalledOnce());

    await act(() => leave.reject(new Error('Leave unavailable')));

    await waitFor(() => expect(screen.getByText('Leave unavailable')).toBeInTheDocument());
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('suppresses an obsolete join error when the final desired state is already confirmed', async () => {
    const join = deferred();
    mocks.joinMutateAsync.mockReturnValueOnce(join.promise);
    renderReadiness(claim());

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.joinMutateAsync).toHaveBeenCalledOnce());
    fireEvent.click(toggle);

    await act(() => join.reject(new Error('Queue unavailable')));

    await waitFor(() => expect(toggle).not.toHaveAttribute('aria-busy'));
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText('Queue unavailable')).not.toBeInTheDocument();
  });

  it('cancels pending readiness when the response kind changes', () => {
    const view = renderReadiness(claim({ viewer_response: null }), indexing('positive'));
    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));

    view.rerender(readiness(claim({ response_kind: 'veracity', viewer_response: null }), view.queryClient));

    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Debate' })).toBeDisabled();
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();
  });

  it('cancels pending readiness when the user signs out', () => {
    const view = renderReadiness(claim({ viewer_response: null }), indexing('positive'));
    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));

    mocks.authenticated = false;
    mocks.accountKey = null;
    view.rerender(readiness(claim({ viewer_response: null }), view.queryClient));

    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
    expect(mocks.joinMutateAsync).not.toHaveBeenCalled();
  });

  it('renders only the compact Debate switch in claim action rows', () => {
    renderReadiness(claim(), idleIndexingState(), true);

    expect(screen.getByRole('switch', { name: 'Debate' })).toBeInTheDocument();
    expect(screen.queryByText('Ready to debate')).not.toBeInTheDocument();
    expect(screen.queryByText(/your response/i)).not.toBeInTheDocument();
  });

  it.each([
    ['claim_response_kind_changed', 'This claim’s response type changed. Respond and enable Debate again.'],
    [
      'claim_response_validation_failed',
      'Your response could not be verified yet. Debate will remain enabled while verification retries.',
    ],
  ])('turns %s into an actionable readiness message', (reason, message) => {
    renderReadiness(claim({ readiness_disabled_reason: reason }));

    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it.each(['user_disabled', 'claim_response_withdrawn'])('does not expose %s lifecycle state', reason => {
    renderReadiness(claim({ readiness_disabled_reason: reason }));

    expect(screen.queryByText(reason)).not.toBeInTheDocument();
    expect(screen.queryByText('Your response was withdrawn, so Debate was turned off.')).not.toBeInTheDocument();
  });
});

type IndexingState =
  | ReturnType<typeof idleIndexingState>
  | ReturnType<typeof indexing>
  | ReturnType<typeof indexingClear>
  | ReturnType<typeof indexed>;

function renderReadiness(
  debateClaim: DebateClaim,
  indexingState: IndexingState = idleIndexingState(),
  compact = false
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(
    entityResponseIndexingQueryKey('profile-space-1', 'claim-1', 'space-1', debateClaim.response_kind),
    indexingState
  );

  return { queryClient, ...render(readiness(debateClaim, queryClient, compact)) };
}

function readiness(debateClaim: DebateClaim, queryClient: QueryClient, compact = false): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <ClaimDebateReadiness
        debateClaim={debateClaim}
        entityId="claim-1"
        spaceId="space-1"
        canEnable
        textVariant="metadata"
        compact={compact}
      />
    </QueryClientProvider>
  );
}

function idleIndexingState() {
  return { status: 'idle' as const, pending: null, runId: null };
}

function indexing(expectedResponse: 'positive' | 'negative') {
  return {
    status: 'reconciling' as const,
    pending: {
      entityId: 'claim-1',
      expectedResponse,
      personalSpaceId: 'profile-space-1',
      responseKind: 'stance' as const,
      spaceId: 'space-1',
    },
    runId: 'response-run-1',
  };
}

function indexingClear() {
  return {
    ...indexing('positive'),
    pending: { ...indexing('positive').pending, expectedResponse: null },
  };
}

function indexed(expectedResponse: 'positive' | 'negative') {
  return { ...indexing(expectedResponse), status: 'indexed' as const };
}

function claim(overrides: Partial<DebateClaim> = {}): DebateClaim {
  return {
    id: 'debate-claim-1',
    space_id: 'space-1',
    claim_entity_id: 'claim-1',
    claim: 'A claim',
    description: null,
    response_kind: 'stance',
    viewer_response: { position: true, position_label: 'Agree' },
    viewer_debate_ready: false,
    readiness_disabled_reason: null,
    readiness_changed_at: null,
    online_choices: [],
    active_match: null,
    active_debate: null,
    created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

function queueResponse(viewerDebateReady: boolean) {
  return { claim: claim({ viewer_debate_ready: viewerDebateReady }), match: null };
}

function deferred(defaultValue: unknown = queueResponse(true)) {
  let resolve!: (value?: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((promiseResolve, promiseReject) => {
    resolve = value => promiseResolve(value ?? defaultValue);
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}
