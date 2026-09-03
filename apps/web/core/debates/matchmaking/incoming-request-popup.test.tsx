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

  // GEO-2813 removed the "Debate this claim" switch, which was the only control here that stood the
  // viewer down on the claim itself. Readiness now follows from holding a position, so dismissing
  // answers the request and drops the intent, and nothing in the client writes readiness.
  it('offers no readiness switch', () => {
    renderPopup();

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('answers once however fast the dismissal is tapped', () => {
    renderPopup();

    const dismiss = screen.getByRole('button', { name: 'Dismiss forever' });
    fireEvent.click(dismiss);
    fireEvent.click(dismiss);

    expect(mocks.dismiss).toHaveBeenCalledTimes(1);
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

  // The controls come back after a failure, so the press that follows has to land — otherwise the
  // request can never be answered from this popup again.
  it('lets the viewer answer again after a failed answer', () => {
    // Fail the way react-query does: run onError *and* leave the mutation in its error state.
    mocks.dismiss.mockImplementation((_variables, options) => {
      mocks.dismissIsError = true;
      options?.onError?.(new Error('nope'));
    });
    const view = render(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss forever' }));
    expect(mocks.dismiss).toHaveBeenCalledTimes(1);

    view.rerender(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss forever' }));

    expect(mocks.dismiss).toHaveBeenCalledTimes(2);
  });

  // Accepting consumes the answer, so a dismissal landing behind it would answer a request the
  // server has already taken — the second call 409s over the first.
  it('ignores a dismissal once the request was already answered', () => {
    render(<IncomingRequestPopup request={request} currentUserId="user-me" onNotNow={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss forever' }));

    expect(mocks.accept).toHaveBeenCalledTimes(1);
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });
});
