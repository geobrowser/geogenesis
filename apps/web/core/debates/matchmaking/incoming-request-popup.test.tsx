import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRequest } from '../api';
import { IncomingRequestPopup } from './incoming-request-popup';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  dismiss: vi.fn(),
  dismissIsError: false,
  block: vi.fn(),
  setReadiness: vi.fn(),
  readinessIsError: false,
}));

vi.mock('./hooks', () => ({
  useAcceptDebateRequest: () => ({ mutate: mocks.accept, isPending: false, isError: false, error: null }),
  useDismissDebateRequest: () => ({
    mutate: mocks.dismiss,
    isPending: false,
    isError: mocks.dismissIsError,
    error: mocks.dismissIsError ? new Error('nope') : null,
  }),
  useBlockDebateUser: () => ({ mutate: mocks.block, isPending: false, isError: false, error: null }),
  useClaimReadiness: () => ({
    mutate: mocks.setReadiness,
    isPending: false,
    isError: mocks.readinessIsError,
    error: mocks.readinessIsError ? new Error('queue down') : null,
  }),
}));

// useSpaceLabels reads the browse sidebar's cache before falling back to the mock below. These
// suites render without a QueryClientProvider, so the read is stubbed as "nothing cached yet".
vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({
  useBrowseSidebarQuerySource: () => ({
    personalSpaceId: null,
    walletAddress: undefined,
    keyInput: null,
    isLoading: false,
  }),
  useCachedBrowseSidebarData: () => null,
}));

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
}));

const request: DebateRequest = {
  id: 'request-1',
  status: 'pending',
  claim: {
    id: 'claim-row-1',
    space_id: 'space-1',
    claim_entity_id: 'claim-1',
    claim: 'Fast fashion should be discouraged with higher taxation',
    description: null,
  },
  requester: {
    user_id: 'user-them',
    profile_space_id: 'space-them',
    display_name: 'Salina Mitchell',
    avatar_cid: null,
    online: true,
    available_to_debate: true,
    in_debate: false,
    online_since: '2026-08-05T11:00:00.000Z',
    position: false,
    position_label: 'No',
  },
  recipient: {
    user_id: 'user-me',
    profile_space_id: 'space-me',
    display_name: 'You',
    avatar_cid: null,
    online: true,
    available_to_debate: true,
    in_debate: false,
    online_since: '2026-08-05T11:30:00.000Z',
    position: true,
    position_label: 'Yes',
  },
  turn_format_id: null,
  created_at: '2026-08-05T12:00:00.000Z',
  expires_at: '2026-08-05T12:25:00.000Z',
};

beforeEach(() => {
  mocks.accept.mockReset();
  mocks.dismiss.mockReset();
  mocks.dismissIsError = false;
  mocks.block.mockReset();
  mocks.setReadiness.mockReset();
  mocks.readinessIsError = false;
  // The dismissal is chained off leaving the queue, so the default mock has to succeed the way
  // react-query does or nothing downstream of it ever runs.
  mocks.setReadiness.mockImplementation((_variables, options) => options?.onSuccess?.());

  // Radix popovers measure their content; jsdom ships neither observer.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe('IncomingRequestPopup', () => {
  function renderPopup(onNotNow = vi.fn()) {
    render(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={onNotNow} />);
    return onNotNow;
  }

  it('accepts the request', () => {
    renderPopup();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(mocks.accept).toHaveBeenCalledWith({ requestId: 'request-1' }, expect.anything());
  });

  it('keeps "Not now" local so the request stays in the requests tab', () => {
    const onNotNow = renderPopup();

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(onNotNow).toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it('drops the claim intent when dismissing the claim forever', () => {
    renderPopup();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss forever' }));

    expect(mocks.dismiss).toHaveBeenCalledWith({ requestId: 'request-1', removeIntent: true }, expect.anything());
  });

  // Saying you don't want to debate the claim answers this request too: leaving it pending would
  // offer a debate the viewer just declined, and hold the requester waiting on someone who has
  // stood down. Dismissing with the intent removed does both, and the server clears the request
  // for the requester as well.
  it('rejects the request when the viewer turns the claim toggle off', () => {
    renderPopup();

    const toggle = screen.getByRole('switch', { name: 'Debate this claim' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);

    expect(mocks.dismiss).toHaveBeenCalledWith({ requestId: 'request-1', removeIntent: true }, expect.anything());
    // And leave the claim's queue: dismissing answers this request, but only leaving the queue
    // takes the viewer out of everyone else's matches for the claim.
    expect(mocks.setReadiness).toHaveBeenCalledWith(
      { spaceId: 'space-1', claimId: 'claim-1', ready: false },
      expect.anything()
    );
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it('answers once however fast the toggle is tapped', () => {
    renderPopup();

    const toggle = screen.getByRole('switch', { name: 'Debate this claim' });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(mocks.dismiss).toHaveBeenCalledTimes(1);
    expect(mocks.setReadiness).toHaveBeenCalledTimes(1);
  });

  it('offers blocking behind the overflow menu', () => {
    renderPopup();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block Salina Mitchell' }));

    expect(mocks.block).toHaveBeenCalledWith('user-them');
  });
});

describe('IncomingRequestPopup answers', () => {
  // A double tap used to send two accepts: `isPending` only disables the button a render later.
  it('answers a request once however fast the taps land', () => {
    render(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={vi.fn()} />);

    const accept = screen.getByRole('button', { name: 'Accept' });
    fireEvent.click(accept);
    fireEvent.click(accept);

    expect(mocks.accept).toHaveBeenCalledTimes(1);
  });

  // Otherwise the switch reads as "you are out of matchmaking for this claim" while the server
  // still has the viewer standing ready and the request live. Starting in the error state would
  // never move the switch off, so this walks the real sequence: off on the press, back on when the
  // rejection comes back failed.
  it('puts the claim toggle back when the rejection fails', () => {
    const view = render(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={vi.fn()} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Debate this claim' }));
    expect(screen.getByRole('switch', { name: 'Debate this claim' })).toHaveAttribute('aria-checked', 'false');

    mocks.dismissIsError = true;
    view.rerender(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={vi.fn()} />);

    expect(screen.getByRole('switch', { name: 'Debate this claim' })).toHaveAttribute('aria-checked', 'true');
  });

  // The controls come back after a failure, so the press that follows has to land — otherwise the
  // request can never be answered from this popup again.
  it('lets the viewer answer again after a failed answer', () => {
    // Fail the way react-query does: run onError *and* leave the mutation in its error state.
    mocks.dismiss.mockImplementation((_variables, options) => {
      mocks.dismissIsError = true;
      options?.onError?.(new Error('nope'));
    });
    const view = render(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={vi.fn()} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Debate this claim' }));
    expect(mocks.dismiss).toHaveBeenCalledTimes(1);

    view.rerender(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Debate this claim' }));

    expect(mocks.dismiss).toHaveBeenCalledTimes(2);
  });

  // The two calls can fail independently and no endpoint does both. Dismissing first would close
  // the popup on a viewer who is still in the queue — matchable on a claim they just declined, with
  // nothing left to retry from. Leaving the queue first keeps the failure recoverable.
  it('does not dismiss the request when leaving the claim queue fails', () => {
    mocks.setReadiness.mockImplementation((_variables, options) => {
      mocks.readinessIsError = true;
      options?.onError?.(new Error('queue down'));
    });
    const view = render(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={vi.fn()} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Debate this claim' }));

    expect(mocks.dismiss).not.toHaveBeenCalled();

    // The request is still live, so the switch has to come back and the next press has to land.
    view.rerender(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'Debate this claim' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('switch', { name: 'Debate this claim' }));
    expect(mocks.setReadiness).toHaveBeenCalledTimes(2);
  });

  // The switch moves on press rather than on the response, so it has to check that the press was
  // actually taken: accepting first consumes the answer, and a failed accept would otherwise leave
  // the switch off with no stand-down behind it.
  it('leaves the claim toggle alone when the request was already answered', () => {
    render(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Debate this claim' }));

    expect(mocks.setReadiness).not.toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Debate this claim' })).toHaveAttribute('aria-checked', 'true');
  });
});
