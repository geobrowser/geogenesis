import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError, GeoChatSessionError } from '../api';
import { HubQueryState } from './hub-states';

afterEach(cleanup);

/**
 * The state a brand-new account lands in.
 *
 * geo-chat refuses the session exchange with a 401 for a minute or two after sign-up, while it
 * registers the account. Both of the states that existed lie about that — the sign-in prompt at
 * somebody who has just signed in, "Something went wrong" about something going right and
 * unfinished — and the reads behind it wait the refusal out, which react-query reports as loading,
 * so the viewer watched a skeleton for the whole minute instead.
 */
describe('a viewer geo-chat has not registered yet', () => {
  const refused = new GeoChatSessionError(new GeoChatRequestError('not yet', null, 401));

  it('says what is happening rather than that something broke', () => {
    render(
      <HubQueryState isLoading={false} error={refused} isEmpty={false} emptyMessage="" onRetry={vi.fn()}>
        <div>rows</div>
      </HubQueryState>
    );

    expect(screen.getByText(/Setting up your account/)).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  // The one that matters in practice: until the retries are exhausted this is a *loading* query, so
  // reading only the settled error left the viewer on a skeleton for as long as the waiting lasted.
  it('says it while the reads are still waiting the refusal out', () => {
    render(
      <HubQueryState isLoading error={null} failureReason={refused} isEmpty={false} emptyMessage="">
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
      <HubQueryState isLoading error={null} failureReason={refused} isEmpty={false} emptyMessage="" onRetry={vi.fn()}>
        <div>rows</div>
      </HubQueryState>
    );

    expect(screen.getByText('Setting up your account. Check back in a minute.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  // And offers it once they are, which is the state that can act on a press.
  it('offers one once they have given up', () => {
    render(
      <HubQueryState isLoading={false} error={refused} isEmpty={false} emptyMessage="" onRetry={vi.fn()}>
        <div>rows</div>
      </HubQueryState>
    );

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
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
