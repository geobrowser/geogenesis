import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateRequest } from '../api';
import { IncomingRequestPopup } from './incoming-request-popup';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  dismiss: vi.fn(),
  block: vi.fn(),
  setReadiness: vi.fn(),
}));

vi.mock('./hooks', () => ({
  useAcceptDebateRequest: () => ({ mutate: mocks.accept, isPending: false, error: null }),
  useDismissDebateRequest: () => ({ mutate: mocks.dismiss, isPending: false, error: null }),
  useBlockDebateUser: () => ({ mutate: mocks.block, isPending: false, error: null }),
  useClaimReadiness: () => ({ mutate: mocks.setReadiness, isPending: false, error: null }),
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
  mocks.block.mockReset();
  mocks.setReadiness.mockReset();

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

    expect(mocks.accept).toHaveBeenCalledWith({ requestId: 'request-1' });
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

    expect(mocks.dismiss).toHaveBeenCalledWith({ requestId: 'request-1', removeIntent: true });
  });

  // Standing down from the claim is not an answer to this request — the request is left alone so
  // it can still be accepted, or left to expire, from the Requests tab.
  it('stands the viewer down from the claim without answering the request', () => {
    renderPopup();

    const toggle = screen.getByRole('switch', { name: 'Debate this claim' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);

    expect(mocks.setReadiness).toHaveBeenCalledWith({
      spaceId: 'space-1',
      claimId: 'claim-1',
      ready: false,
    });
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it('offers blocking behind the overflow menu', () => {
    renderPopup();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block Salina Mitchell' }));

    expect(mocks.block).toHaveBeenCalledWith('user-them');
  });
});
