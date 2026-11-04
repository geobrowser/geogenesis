import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError, GeoChatSessionError } from '../api';
import { HubQueryState } from './hub-states';

afterEach(cleanup);

/**
 * The state a brand-new account lands in while geo-chat refuses its session exchange with a 401.
 * Neither the sign-in prompt nor "Something went wrong" is true of it.
 */
describe('a viewer geo-chat has not registered yet', () => {
  const refused = new GeoChatSessionError(new GeoChatRequestError('not yet', null, 401));

  it('says what is happening rather than that something broke', () => {
    render(
      <HubQueryState
        analyticsSurface="hub"
        isLoading={false}
        error={refused}
        isEmpty={false}
        emptyMessage=""
        onRetry={vi.fn()}
      >
        <div>rows</div>
      </HubQueryState>
    );

    expect(screen.getByText(/Setting up your account/)).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong.')).toBeNull();
    // `useGeoChatAccountRecovery` refetches by itself, so there is nothing to press.
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  // The one that matters in practice: until the retries are exhausted this is a *loading* query, so
  // reading only the settled error left the viewer on a skeleton for as long as the waiting lasted.
  it('says it while the reads are still waiting the refusal out', () => {
    render(
      <HubQueryState
        analyticsSurface="hub"
        isLoading
        error={null}
        failureReason={refused}
        isEmpty={false}
        emptyMessage=""
      >
        <div>rows</div>
      </HubQueryState>
    );

    expect(screen.getByText(/Setting up your account/)).toBeInTheDocument();
  });

  /**
   * And offers no button while the reads are still trying.
   *
   * `refetch()` joins an in-flight retry rather than starting a request, so during the wait the
   * button would be a control that visibly does nothing — worse than no control, because a reader
   * who presses it and sees nothing happen concludes the page is broken rather than busy. It
   * appears once the retries are spent, which is when it can do something.
   */
  it('offers no retry while the reads are still trying', () => {
    render(
      <HubQueryState
        analyticsSurface="hub"
        isLoading
        error={null}
        failureReason={refused}
        isEmpty={false}
        emptyMessage=""
        onRetry={vi.fn()}
      >
        <div>rows</div>
      </HubQueryState>
    );

    expect(screen.getByText('Setting up your account. This updates on its own.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  // An outage on geo-chat's side is not the viewer's account being set up.
  it('says debates are unreachable for an upstream failure', () => {
    render(
      <HubQueryState
        analyticsSurface="hub"
        isLoading={false}
        error={new GeoChatSessionError(new GeoChatRequestError('upstream', 'auth_upstream_failed', 401))}
        isEmpty={false}
        emptyMessage=""
      >
        <div>rows</div>
      </HubQueryState>
    );

    expect(screen.getByText('Can’t reach debates right now. Retrying…')).toBeInTheDocument();
    expect(screen.queryByText(/Setting up your account/)).toBeNull();
  });

  // A wallet-less account will not be fixed by waiting.
  it('is an ordinary error for no_embedded_wallet', () => {
    render(
      <HubQueryState
        analyticsSurface="hub"
        isLoading={false}
        error={new GeoChatSessionError(new GeoChatRequestError('no wallet', 'no_embedded_wallet', 401))}
        isEmpty={false}
        emptyMessage=""
      >
        <div>rows</div>
      </HubQueryState>
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  /**
   * And it is not this, for a caller that might be asking on behalf of nobody.
   *
   * The same 401 means "sign in" to a surface offering that action, and "we do not have you yet" to
   * one that has already established the viewer is signed in. The status cannot tell them apart, so
   * who is asking does.
   */
  it('is the sign-in prompt where the caller offers one', () => {
    render(
      <HubQueryState
        analyticsSurface="hub"
        isLoading={false}
        error={refused}
        isEmpty={false}
        emptyMessage=""
        signInAction={{ label: 'Sign in', message: 'Sign in to see this.', onClick: vi.fn() }}
      >
        <div>rows</div>
      </HubQueryState>
    );

    expect(screen.getByText('Sign in to see this.')).toBeInTheDocument();
    expect(screen.queryByText(/Setting up your account/)).toBeNull();
  });

  // A fault is still a fault. Only the refusal means an account on its way.
  it('leaves a server fault as an error', () => {
    render(
      <HubQueryState
        analyticsSurface="hub"
        isLoading={false}
        error={new GeoChatRequestError('boom', null, 500)}
        isEmpty={false}
        emptyMessage=""
        onRetry={vi.fn()}
      >
        <div>rows</div>
      </HubQueryState>
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });
});

describe('shared query-state analytics', () => {
  it('attributes an empty-state action to rematch when rematch owns the state', () => {
    render(
      <HubQueryState
        analyticsSurface="rematch"
        isLoading={false}
        error={null}
        isEmpty
        emptyMessage="No claims match these filters."
        emptyAction={{ label: 'Clear filters', onClick: vi.fn() }}
      >
        <div>rows</div>
      </HubQueryState>
    );

    const action = screen.getByRole('button', { name: 'Clear filters' });
    expect(action).toHaveAttribute('data-geo-analytics-label', 'Debate rematch Clear filters');
    expect(action).toHaveAttribute('data-geo-analytics-intent', 'debate_rematch_action');
  });
});
