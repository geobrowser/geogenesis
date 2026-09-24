import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  canChallenge: true,
  createChallenge: vi.fn(),
  isPending: false,
  activityOutboundRequest: null as { id: string } | null,
  requestsOutboundRequest: null as { id: string } | null,
  disabledRequestsOutboundRequest: null as { id: string } | null,
  outboundChallenge: null as { id: string } | null,
  outboundChallengeDirectionUnknown: false,
}));

vi.mock('./hooks', () => ({
  useDebateProfile: () => ({ data: { can_challenge: mocks.canChallenge } }),
  useDebateActivity: () => ({ data: { outbound_request: mocks.activityOutboundRequest } }),
  useCreateDebateChallenge: () => ({
    mutate: mocks.createChallenge,
    isPending: mocks.isPending,
    error: null,
  }),
}));

vi.mock('./matchmaking/hooks', () => ({
  useDebateRequests: (enabled: boolean) => ({
    data: {
      outbound: enabled ? mocks.requestsOutboundRequest : mocks.disabledRequestsOutboundRequest,
    },
  }),
}));

vi.mock('./matchmaking/use-outbound-debate-challenge', () => ({
  useOutboundDebateChallenge: () => ({
    outboundChallenge: mocks.outboundChallenge,
    outboundChallengeDirectionUnknown: mocks.outboundChallengeDirectionUnknown,
  }),
}));

vi.mock('./use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => 'viewer-user',
}));

const { ProfileDebateButton } = await import('./profile-debate-button');

beforeEach(() => {
  mocks.canChallenge = true;
  mocks.isPending = false;
  mocks.activityOutboundRequest = null;
  mocks.requestsOutboundRequest = null;
  mocks.disabledRequestsOutboundRequest = null;
  mocks.outboundChallenge = null;
  mocks.outboundChallengeDirectionUnknown = false;
  mocks.createChallenge.mockReset();
});

afterEach(cleanup);

describe('ProfileDebateButton', () => {
  /**
   * Same mutation the People tab row fires, so it carries the same label: clicking sends a
   * request the other person has to accept, it does not start a debate.
   */
  it('asks for a debate rather than promising one', () => {
    render(<ProfileDebateButton spaceId="profile-them" />);

    const button = screen.getByRole('button', { name: 'Request debate' });
    fireEvent.click(button);

    expect(mocks.createChallenge).toHaveBeenCalledWith({ recipient_profile_space_id: 'profile-them' });
  });

  /**
   * This sits at the end of the profile name row. `h-7` is fixed and the button's own `shrink-0`
   * only governs height (its wrapper is `flex-col`), so without nowrap a long display name
   * squeezed the pill until "Request debate" wrapped and spilled out of it.
   */
  it('keeps its label on one line however long the name beside it is', () => {
    render(<ProfileDebateButton spaceId="profile-them" />);

    expect(screen.getByRole('button')).toHaveClass('whitespace-nowrap', 'h-7');
  });

  it('reports the request in flight', () => {
    mocks.isPending = true;
    render(<ProfileDebateButton spaceId="profile-them" />);

    expect(screen.getByRole('button', { name: 'Requesting...' })).toBeDisabled();
  });

  it('blocks another person request while an outbound person challenge is pending', () => {
    mocks.outboundChallenge = { id: 'challenge-outbound' };
    render(<ProfileDebateButton spaceId="profile-them" />);

    const button = screen.getByRole('button', { name: 'Request debate' });
    expect(button).toBeDisabled();
    expect(screen.getByTitle('You can only have one pending outbound request at a time.')).toContainElement(button);

    fireEvent.click(button);
    expect(mocks.createChallenge).not.toHaveBeenCalled();
  });

  it('blocks another person request while an outbound claim request is pending', () => {
    mocks.requestsOutboundRequest = { id: 'claim-request-outbound' };
    render(<ProfileDebateButton spaceId="profile-them" />);

    const button = screen.getByRole('button', { name: 'Request debate' });
    expect(button).toBeDisabled();
    expect(screen.getByTitle('You can only have one pending outbound request at a time.')).toContainElement(button);

    fireEvent.click(button);
    expect(mocks.createChallenge).not.toHaveBeenCalled();
  });

  it('stops blocking after the authoritative request list clears a stale cached outbound request', () => {
    mocks.disabledRequestsOutboundRequest = { id: 'stale-claim-request' };
    render(<ProfileDebateButton spaceId="profile-them" />);

    const button = screen.getByRole('button', { name: 'Request debate' });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(mocks.createChallenge).toHaveBeenCalledWith({ recipient_profile_space_id: 'profile-them' });
  });

  it('stays hidden when the server says this person cannot be challenged', () => {
    mocks.canChallenge = false;
    const { container } = render(<ProfileDebateButton spaceId="profile-them" />);

    expect(container).toBeEmptyDOMElement();
  });
});
