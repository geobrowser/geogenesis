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
import { clearLocalVotes, readLocalVotes, toggleLocalVote } from '~/core/state/local-votes';
import {
  closeSaveVotesPrompt,
  markPromptedThisSession,
  openSaveVotesPrompt,
  readSaveVotesPrompt,
} from '~/core/state/save-votes-prompt';

import { SaveVotesSheet } from './save-votes-sheet';

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  signIn: vi.fn(),
  beginPrivyAuth: vi.fn(),
  cancelPrivyAuth: vi.fn(),
  impression: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, isModalOpen: false }),
}));
vi.mock('~/core/hooks/use-any-modal-open', () => ({ useAnyModalOpen: () => false }));
vi.mock('~/core/hooks/use-prepare-onboarding', () => ({ usePrepareOnboarding: () => vi.fn() }));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.signIn }));
vi.mock('~/core/privy-auth-events', () => ({
  beginPrivyAuth: (...args: unknown[]) => mocks.beginPrivyAuth(...args),
  cancelPrivyAuth: () => mocks.cancelPrivyAuth(),
}));
vi.mock('~/core/save-votes-analytics', () => ({
  captureSaveVotesImpression: (...args: unknown[]) => mocks.impression(...args),
  saveVotesSignInProperties: (auth_control: string, local_vote_count: number) => ({
    component: 'save_votes_prompt',
    auth_control,
    local_vote_count,
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

    expect(readLocalVotes().save).toMatchObject({ confirmed: false });
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
    expect(readLocalVotes()).toMatchObject({ save: null, prompt: { dismissCount: 1 } });
    expect(readLocalVotes().votes).toHaveLength(2);
  });

  it('offers the other ways in, as a save that a dismissal withdraws', () => {
    vote('a');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('inline_save'));

    fireEvent.click(screen.getByRole('button', { name: 'Other ways to sign in' }));

    expect(mocks.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ auth_control: 'other_sign_in' }),
      expect.objectContaining({ onCancel: expect.any(Function) })
    );
    expect(readLocalVotes().save).not.toBeNull();
    mocks.signIn.mock.calls[0][1].onCancel();
    expect(readLocalVotes().save).toBeNull();
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
