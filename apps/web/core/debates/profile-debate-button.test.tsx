import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  canChallenge: true,
  createChallenge: vi.fn(),
  isPending: false,
}));

vi.mock('./hooks', () => ({
  useDebateProfile: () => ({ data: { can_challenge: mocks.canChallenge } }),
  useCreateDebateChallenge: () => ({
    mutate: mocks.createChallenge,
    isPending: mocks.isPending,
    error: null,
  }),
}));

const { ProfileDebateButton } = await import('./profile-debate-button');

beforeEach(() => {
  mocks.canChallenge = true;
  mocks.isPending = false;
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

  it('stays hidden when the server says this person cannot be challenged', () => {
    mocks.canChallenge = false;
    const { container } = render(<ProfileDebateButton spaceId="profile-them" />);

    expect(container).toBeEmptyDOMElement();
  });
});
