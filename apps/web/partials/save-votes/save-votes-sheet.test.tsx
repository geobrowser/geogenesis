import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  saveVotesHeading,
  saveVotesNavLabel,
  saveVotesSubtext,
  savedVotesCopy,
  savingVotesCopy,
} from '~/core/save-votes-copy';
import { clearLocalVotes, readLocalVotes, removeLocalVote, toggleLocalVote } from '~/core/state/local-votes';
import {
  closeSaveVotesPrompt,
  markPromptedThisSession,
  openSaveVotesPrompt,
  readSaveVotesPrompt,
} from '~/core/state/save-votes-prompt';

import { useMarkEmailCaptureShowing } from '~/partials/explore/email-capture-presence';

import { SaveVotesSheet } from './save-votes-sheet';

/** Stands in for the Explore email capture card, which shares the sheet's corner. */
function EmailCaptureCard() {
  useMarkEmailCaptureShowing();
  return null;
}

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  signIn: vi.fn(),
  beginPrivyAuth: vi.fn(),
  cancelPrivyAuth: vi.fn(),
  impression: vi.fn(),
  anyModalOpen: false,
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, isModalOpen: false }),
}));
vi.mock('~/core/hooks/use-any-modal-open', () => ({
  useAnyModalOpen: (enabled: boolean) => enabled && mocks.anyModalOpen,
}));
vi.mock('~/core/hooks/use-prepare-onboarding', () => ({ usePrepareOnboarding: () => vi.fn() }));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.signIn }));
vi.mock('~/core/privy-auth-events', () => ({
  beginPrivyAuth: (...args: unknown[]) => mocks.beginPrivyAuth(...args),
  cancelPrivyAuth: () => mocks.cancelPrivyAuth(),
}));
vi.mock('~/core/save-votes-analytics', () => ({
  captureSaveVotesImpression: (...args: unknown[]) => mocks.impression(...args),
  saveVotesSignInProperties: (auth_control: string, local_vote_count: number, prompt_reason?: string) => ({
    component: 'save_votes_prompt',
    auth_control,
    local_vote_count,
    prompt_reason,
  }),
}));
vi.mock('~/partials/explore/email-capture-account-step', () => ({
  AccountStep: ({ email }: { email: string }) => <p>Enter the code we sent to {email}</p>,
}));

const vote = (entityId: string, title = entityId) =>
  toggleLocalVote({ entityId, spaceId: 'space-1', responseKind: 'stance', direction: 'positive', title });

afterEach(cleanup);

beforeEach(() => {
  clearLocalVotes();
  closeSaveVotesPrompt();
  window.sessionStorage.clear();
  mocks.ready = true;
  mocks.authenticated = false;
  mocks.signIn.mockReset();
  mocks.beginPrivyAuth.mockReset();
  mocks.cancelPrivyAuth.mockReset();
  mocks.impression.mockReset();
  mocks.anyModalOpen = false;
});

describe('copy', () => {
  it('names the votes, singular and plural', () => {
    expect(saveVotesHeading(1, false)).toBe('Save your vote');
    expect(saveVotesHeading(2, false)).toBe('Save your 2 votes');
    expect(saveVotesHeading(1, true)).toBe('You have 1 unsaved vote');
    expect(saveVotesHeading(3, true)).toBe('You have 3 unsaved votes');
    expect(saveVotesSubtext(1, false)).toBe(
      'It’s only on this device for now. Add your email and it counts toward the result.'
    );
    expect(saveVotesSubtext(2, true)).toBe(
      'They’re still on this device. Add your email and they count toward the result.'
    );
    expect(saveVotesNavLabel(1)).toBe('Save 1 vote');
    expect(saveVotesNavLabel(4)).toBe('Save 4 votes');
    expect([savingVotesCopy(1), savingVotesCopy(3)]).toEqual(['Saving your vote…', 'Saving 3 votes…']);
    expect([savedVotesCopy(1), savedVotesCopy(3)]).toEqual(['Vote saved', '3 votes saved']);
  });
});

describe('SaveVotesSheet', () => {
  it('stays closed until something asks for it', () => {
    vote('a');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    expect(screen.queryByRole('region', { name: 'Save your votes' })).not.toBeInTheDocument();
  });

  it('asks on arrival when the visitor comes back with unsaved votes', () => {
    vote('a');
    vote('b');
    render(<SaveVotesSheet />);
    expect(screen.getByText('You have 2 unsaved votes')).toBeInTheDocument();
    expect(mocks.impression).toHaveBeenCalledWith('return_visit', 2);
  });

  it('speaks to the lobby only when opened with a lobby name', () => {
    vote('a', 'Couples should keep separate finances');
    markPromptedThisSession();
    render(<SaveVotesSheet />);

    act(() => openSaveVotesPrompt('single_claim', { lobbyName: 'Onboarding with Adam' }));
    const region = screen.getByRole('region', { name: 'Join the discussion' });
    expect(region).toHaveTextContent('Join the discussion');
    expect(region).toHaveTextContent('You’ll stay in Onboarding with Adam, and your audio keeps playing.');
    expect(region).toHaveTextContent('Saved for after sign-up');
    expect(screen.getByRole('list', { name: 'Your votes' })).toHaveTextContent('Couples should keep separate finances');

    act(() => closeSaveVotesPrompt());
    act(() => openSaveVotesPrompt('single_claim'));
    expect(screen.getByRole('region', { name: 'Save your votes' })).not.toHaveTextContent('Join the discussion');
    expect(screen.getByText('Save your vote')).toBeInTheDocument();
  });

  it('counts an automatic ask toward the next one', () => {
    vote('a');
    vote('b');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('threshold'));
    expect(screen.getByText('Save your 2 votes')).toBeInTheDocument();
    expect(readLocalVotes().prompt.shownCount).toBe(1);
  });

  it('rejects an address that is not an email', () => {
    vote('a');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('single_claim'));

    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'sam@hey' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save vote' }));

    expect(screen.getByRole('alert')).toHaveTextContent('That does not look like an email address.');
    expect(mocks.beginPrivyAuth).not.toHaveBeenCalled();
  });

  it('starts a save sign-in with the email and moves to the code step', () => {
    vote('a');
    vote('b');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('threshold'));

    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: ' sam@hey.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save votes' }));

    expect(mocks.beginPrivyAuth).toHaveBeenCalledWith(expect.objectContaining({ auth_control: 'email' }));
    expect(screen.getByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText('Enter the code we sent to sam@hey.com')).toBeInTheDocument();
  });

  it('closing keeps the votes, withdraws the sign-in, and is remembered', () => {
    vote('a');
    vote('b');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('threshold'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'sam@hey.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save votes' }));

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(readSaveVotesPrompt()).toBeNull();
    expect(mocks.cancelPrivyAuth).toHaveBeenCalled();
    expect(readLocalVotes().prompt.dismissCount).toBe(1);
    expect(readLocalVotes().votes).toHaveLength(2);
  });

  it('offers the other ways in, as a save sign-in', () => {
    vote('a');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('inline_save'));

    fireEvent.click(screen.getByRole('button', { name: 'Other ways to sign in' }));

    expect(mocks.signIn).toHaveBeenCalledWith(expect.objectContaining({ auth_control: 'other_sign_in' }));
    expect(readSaveVotesPrompt()).toBeNull();
  });

  // Copilot on #2785: an ask that opens on its own uses one up, return visits included.
  it('counts a return-visit ask toward the next one', () => {
    vote('a');
    render(<SaveVotesSheet />);
    expect(screen.getByText('You have 1 unsaved vote')).toBeInTheDocument();
    expect(readLocalVotes().prompt.shownCount).toBe(1);
  });

  // Copilot on #2785: waiting behind an overlay is not being shown.
  it('neither counts nor measures an ask until it is out from behind an overlay', () => {
    vote('a');
    vote('b');
    markPromptedThisSession();
    mocks.anyModalOpen = true;
    const { rerender } = render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('threshold'));

    expect(screen.queryByRole('region', { name: 'Save your votes' })).not.toBeInTheDocument();
    expect(readLocalVotes().prompt.shownCount).toBe(0);
    expect(mocks.impression).not.toHaveBeenCalled();

    mocks.anyModalOpen = false;
    rerender(<SaveVotesSheet />);
    expect(readLocalVotes().prompt.shownCount).toBe(1);
    expect(mocks.impression).toHaveBeenCalledOnce();

    // Covered and uncovered again, it is the same opening.
    mocks.anyModalOpen = true;
    rerender(<SaveVotesSheet />);
    mocks.anyModalOpen = false;
    rerender(<SaveVotesSheet />);
    expect(readLocalVotes().prompt.shownCount).toBe(1);
    expect(mocks.impression).toHaveBeenCalledOnce();
  });

  // Copilot on #2785 (round 2): the two cards share a corner and neither is a dialog.
  it('waits behind the email capture card while it is up', () => {
    vote('a');
    vote('b');
    markPromptedThisSession();
    const { rerender } = render(
      <>
        <EmailCaptureCard />
        <SaveVotesSheet />
      </>
    );
    act(() => openSaveVotesPrompt('threshold'));
    expect(screen.queryByRole('region', { name: 'Save your votes' })).not.toBeInTheDocument();
    expect(mocks.impression).not.toHaveBeenCalled();

    rerender(<SaveVotesSheet />);
    expect(screen.getByRole('region', { name: 'Save your votes' })).toBeInTheDocument();
  });

  // Copilot on #2785 (round 4): an ask belongs to the votes it was about.
  it('does not reopen an old ask for the next vote once every vote was taken back', () => {
    vote('a');
    vote('b');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('threshold'));
    expect(screen.getByRole('region', { name: 'Save your votes' })).toBeInTheDocument();

    act(() => {
      removeLocalVote({ entityId: 'a', spaceId: 'space-1', responseKind: 'stance' });
      removeLocalVote({ entityId: 'b', spaceId: 'space-1', responseKind: 'stance' });
    });
    act(() => {
      vote('c');
    });

    expect(screen.queryByRole('region', { name: 'Save your votes' })).not.toBeInTheDocument();
    expect(readSaveVotesPrompt()).toBeNull();
  });

  it('shows up to two of the votes, then how many more', () => {
    vote('a', 'First claim');
    vote('b', 'Second claim');
    vote('c', 'Third claim');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('threshold'));

    const chips = screen.getByRole('list', { name: 'Your votes' });
    expect(chips).toHaveTextContent('Third claim');
    expect(chips).toHaveTextContent('Second claim');
    expect(chips).not.toHaveTextContent('First claim');
    expect(chips).toHaveTextContent('+1');
  });
});

// GEO-3400: the navbar's "Save N votes" opens the same sheet, centred, instead of Privy's dialog.
describe('SaveVotesSheet from the navbar', () => {
  const openFromNavbar = () => {
    vote('a', 'First claim');
    vote('b', 'Second claim');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('navbar'));
  };

  it('is a centred modal dialog with the corner card’s content', () => {
    openFromNavbar();

    const dialog = screen.getByRole('dialog', { name: 'Save your votes' });
    expect(dialog).toHaveTextContent('Save your 2 votes');
    expect(dialog).toHaveTextContent('Other ways to sign in');
    expect(screen.getByRole('list', { name: 'Your votes' })).toHaveTextContent('Second claim');
    expect(screen.queryByRole('region', { name: 'Save your votes' })).not.toBeInTheDocument();
    expect(mocks.impression).toHaveBeenCalledWith('navbar', 2);
  });

  it('is not an automatic ask, so it does not use one up', () => {
    openFromNavbar();
    expect(readLocalVotes().prompt.shownCount).toBe(0);
  });

  // It is a modal itself, which the any-modal check would otherwise find and hide behind.
  it('stays up while a modal is open, where the corner card would wait', () => {
    mocks.anyModalOpen = true;
    openFromNavbar();
    expect(screen.getByRole('dialog', { name: 'Save your votes' })).toBeVisible();
  });

  it('tags its sign-ins with the navbar, both ways in', () => {
    openFromNavbar();
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'sam@hey.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save votes' }));
    expect(mocks.beginPrivyAuth).toHaveBeenCalledWith(
      expect.objectContaining({ auth_control: 'email', prompt_reason: 'navbar' })
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Enter the code we sent to sam@hey.com');

    cleanup();
    closeSaveVotesPrompt();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('navbar'));
    fireEvent.click(screen.getByRole('button', { name: 'Other ways to sign in' }));
    expect(mocks.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ auth_control: 'other_sign_in', prompt_reason: 'navbar' })
    );
    expect(readSaveVotesPrompt()).toBeNull();
  });

  it('closes on Escape and keeps the votes, like the corner card', () => {
    openFromNavbar();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(readSaveVotesPrompt()).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(readLocalVotes().prompt.dismissCount).toBe(1);
    expect(readLocalVotes().votes).toHaveLength(2);
  });

  it('takes over from the corner card rather than showing both', () => {
    vote('a');
    vote('b');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('threshold'));
    expect(screen.getByRole('region', { name: 'Save your votes' })).toBeInTheDocument();

    act(() => openSaveVotesPrompt('navbar'));
    expect(screen.queryByRole('region', { name: 'Save your votes' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Save your votes' })).toBeInTheDocument();
  });
});
