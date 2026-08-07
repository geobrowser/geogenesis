import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ReactElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entityResponseIndexingQueryKey } from '~/core/responses/entity-response';

import { type DebateClaim, GeoChatRequestError } from './api';
import { ClaimDebateReadiness } from './claim-debate-readiness';

const mocks = vi.hoisted(() => ({
  joinMutate: vi.fn(),
  joinReset: vi.fn(),
  leaveMutate: vi.fn(),
  responseKinds: [] as Array<'stance' | 'veracity' | null>,
  authenticated: true,
  accountKey: 'account-1' as string | null,
}));

vi.mock('./hooks', () => ({
  useGeoChatAuth: () => ({ authenticated: mocks.authenticated, accountKey: mocks.accountKey }),
  useJoinDebateQueue: () => ({ mutate: mocks.joinMutate, reset: mocks.joinReset, isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutate: mocks.leaveMutate, isPending: false, error: null }),
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
  mocks.joinMutate.mockReset();
  mocks.joinReset.mockReset();
  mocks.leaveMutate.mockReset();
  mocks.responseKinds.length = 0;
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

  it('optimistically enables persisted readiness through the Debate switch', async () => {
    renderReadiness(claim({ viewer_response: { position: false, position_label: 'Disagree' } }));

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(mocks.joinMutate).toHaveBeenCalledTimes(1));
    expect(mocks.joinMutate).toHaveBeenCalledWith(
      { claimId: 'claim-1' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it('turns persisted readiness off through the same switch', () => {
    renderReadiness(claim({ viewer_debate_ready: true }));

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(mocks.leaveMutate).toHaveBeenCalledWith(
      { claimId: 'claim-1' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it('allows optimistic readiness before indexing without calling geo-chat', () => {
    renderReadiness(claim({ viewer_response: null }), indexing('positive'));

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    expect(toggle).toBeEnabled();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(mocks.joinMutate).not.toHaveBeenCalled();
    expect(screen.queryByText(/processing response|join debate|cancel join|check again/i)).not.toBeInTheDocument();
  });

  it('submits readiness exactly once after geo-chat confirms the expected response', async () => {
    const view = renderReadiness(claim({ viewer_response: null }), indexing('negative'));

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));
    expect(mocks.joinMutate).not.toHaveBeenCalled();

    view.rerender(
      readiness(claim({ viewer_response: { position: false, position_label: 'Disagree' } }), view.queryClient)
    );

    await waitFor(() => expect(mocks.joinMutate).toHaveBeenCalledTimes(1));
    view.rerender(
      readiness(claim({ viewer_response: { position: false, position_label: 'Disagree' } }), view.queryClient)
    );
    expect(mocks.joinMutate).toHaveBeenCalledTimes(1);
  });

  it('turns the optimistic switch off to cancel readiness before confirmation', () => {
    renderReadiness(claim({ viewer_response: null }), indexing('positive'));

    const toggle = screen.getByRole('switch', { name: 'Debate' });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(mocks.joinMutate).not.toHaveBeenCalled();
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
    expect(mocks.joinMutate).not.toHaveBeenCalled();
  });

  it('turns readiness off immediately when the response is optimistically withdrawn', () => {
    renderReadiness(claim({ viewer_debate_ready: true }), indexingClear());

    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText('Waiting for someone with the opposite response.')).not.toBeInTheDocument();
    expect(mocks.leaveMutate).not.toHaveBeenCalled();
  });

  it('refetches and retries once when geo-chat has not observed the response yet', async () => {
    mocks.joinMutate.mockImplementationOnce((_variables, options) => {
      options.onError(new GeoChatRequestError('Respond before debating', 'claim_response_required', 409));
    });
    renderReadiness(claim());

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));

    await waitFor(() => expect(mocks.joinMutate).toHaveBeenCalledTimes(2));
    expect(mocks.joinReset).toHaveBeenCalledOnce();
    expect(screen.queryByText('Respond before debating', { selector: '.text-red-01' })).not.toBeInTheDocument();
  });

  it('clears readiness intent when a validation refetch removes the server response', async () => {
    mocks.joinMutate.mockImplementationOnce((_variables, options) => {
      options.onError(new GeoChatRequestError('Respond before debating', 'claim_response_required', 409));
    });
    const view = renderReadiness(claim());

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));
    view.rerender(readiness(claim({ viewer_response: null }), view.queryClient));

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false')
    );
    expect(mocks.joinMutate).toHaveBeenCalledTimes(1);
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
    mocks.joinMutate.mockImplementationOnce((_variables, options) => {
      options.onError(new Error('Queue unavailable'));
    });
    renderReadiness(claim());

    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));

    await waitFor(() => expect(screen.getByText('Queue unavailable')).toBeInTheDocument());
    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
  });

  it('cancels pending readiness when the response kind changes', () => {
    const view = renderReadiness(claim({ viewer_response: null }), indexing('positive'));
    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));

    view.rerender(readiness(claim({ response_kind: 'veracity', viewer_response: null }), view.queryClient));

    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Debate' })).toBeDisabled();
    expect(mocks.joinMutate).not.toHaveBeenCalled();
  });

  it('cancels pending readiness when the user signs out', () => {
    const view = renderReadiness(claim({ viewer_response: null }), indexing('positive'));
    fireEvent.click(screen.getByRole('switch', { name: 'Debate' }));

    mocks.authenticated = false;
    mocks.accountKey = null;
    view.rerender(readiness(claim({ viewer_response: null }), view.queryClient));

    expect(screen.getByRole('switch', { name: 'Debate' })).toHaveAttribute('aria-checked', 'false');
    expect(mocks.joinMutate).not.toHaveBeenCalled();
  });

  it('renders only the compact Debate switch in claim action rows', () => {
    renderReadiness(claim(), idleIndexingState(), true);

    expect(screen.getByRole('switch', { name: 'Debate' })).toBeInTheDocument();
    expect(screen.queryByText('Ready to debate')).not.toBeInTheDocument();
    expect(screen.queryByText(/your response/i)).not.toBeInTheDocument();
  });

  it('turns backend lifecycle codes into actionable readiness messages', () => {
    renderReadiness(claim({ readiness_disabled_reason: 'claim_response_kind_changed' }));

    expect(
      screen.getByText('This claim’s response type changed. Respond and enable Debate again.')
    ).toBeInTheDocument();
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
