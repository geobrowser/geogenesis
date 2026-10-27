import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { snapshotActionContext } from '~/core/action-context';
import { noteEmailArrival } from '~/core/deep-links/ref-email';
import {
  saveVotesHeading,
  saveVotesNavLabel,
  saveVotesSubtext,
  savedVotesCopy,
  savingVotesCopy,
} from '~/core/save-votes-copy';
import { castLocalVote } from '~/core/state/cast-local-vote';
import { clearLocalVotes, readLocalVotes, removeLocalVote, toggleLocalVote } from '~/core/state/local-votes';
import {
  closeSaveVotesPrompt,
  markPromptedThisSession,
  openSaveVotesPrompt,
  readSaveVotesPrompt,
} from '~/core/state/save-votes-prompt';

import { useMarkEmailCaptureShowing } from '~/partials/explore/email-capture-presence';

import { SaveVotesSheet } from './save-votes-sheet';
import { codeStepClasses } from './save-votes-styles';

/** Stands in for the Explore email capture card, which shares the sheet's corner. */
function EmailCaptureCard() {
  useMarkEmailCaptureShowing();
  return null;
}

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  beginPrivyAuth: vi.fn(),
  cancelPrivyAuth: vi.fn(),
  impression: vi.fn(),
  anyModalOpen: false,
  isModalOpen: false,
  accountStepMounts: 0,
  accountStepClasses: undefined as unknown,
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated, isModalOpen: mocks.isModalOpen }),
}));
vi.mock('~/core/hooks/use-any-modal-open', () => ({
  useAnyModalOpen: (enabled: boolean) => enabled && mocks.anyModalOpen,
}));
vi.mock('~/core/hooks/use-prepare-onboarding', () => ({ usePrepareOnboarding: () => vi.fn() }));
vi.mock('~/core/privy-auth-events', () => ({
  beginPrivyAuth: (...args: unknown[]) => mocks.beginPrivyAuth(...args),
  cancelPrivyAuth: () => mocks.cancelPrivyAuth(),
}));
vi.mock('~/core/analytics-operations', () => ({ recordAction: vi.fn() }));
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
  AccountStep: ({
    email,
    classes,
    onChangeEmail,
  }: {
    email: string;
    classes?: unknown;
    onChangeEmail?: () => void;
  }) => {
    // Mounting the real step is what mails a code, so a remount is a second email.
    React.useEffect(() => {
      mocks.accountStepMounts += 1;
    }, []);
    mocks.accountStepClasses = classes;
    return (
      <>
        <p>Enter the code we sent to {email}</p>
        {onChangeEmail ? (
          <button type="button" onClick={onChangeEmail}>
            Change
          </button>
        ) : null}
      </>
    );
  },
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
  mocks.beginPrivyAuth.mockReset();
  mocks.cancelPrivyAuth.mockReset();
  mocks.impression.mockReset();
  mocks.anyModalOpen = false;
  mocks.isModalOpen = false;
  mocks.accountStepMounts = 0;
  mocks.accountStepClasses = undefined;
});

describe('copy', () => {
  it('names the votes, singular and plural', () => {
    expect(saveVotesHeading(1, false)).toBe('Save your vote');
    expect(saveVotesHeading(2, false)).toBe('Save your 2 votes');
    expect(saveVotesHeading(1, true)).toBe('You have 1 unsaved vote');
    expect(saveVotesHeading(3, true)).toBe('You have 3 unsaved votes');
    expect(saveVotesSubtext(1)).toBe('Add your email to make it count.');
    expect(saveVotesSubtext(2)).toBe('Add your email to make them count.');
    expect(saveVotesSubtext(1, true)).toBe('Log in to make it count.');
    expect(saveVotesSubtext(3, true)).toBe('Log in to make them count.');
    expect(saveVotesNavLabel(1)).toBe('Save 1 vote');
    expect(saveVotesNavLabel(4)).toBe('Save 4 votes');
    expect([savingVotesCopy(1), savingVotesCopy(3)]).toEqual(['Saving your vote…', 'Saving 3 votes…']);
    expect([savedVotesCopy(1), savedVotesCopy(3)]).toEqual(['Vote saved', '3 votes saved']);
  });
});

describe('SaveVotesSheet', () => {
  it.each([
    ['feed', 'threshold', true],
    ['feed', 'threshold', false],
    ['single', 'single_claim', true],
    ['single', 'single_claim', false],
  ] as const)('asks once after the first %s vote (%s, already mounted: %s)', (surface, reason, alreadyMounted) => {
    const cast = (entityId: string, direction: 'positive' | 'negative' = 'positive') =>
      act(() => {
        castLocalVote({
          entityId,
          spaceId: 'space-1',
          responseKind: 'stance',
          direction,
          title: entityId,
          surface,
          attribution: snapshotActionContext('claim_position_control', 'claim', entityId),
        });
      });
    // In the app the sheet is lazy-loaded after the first vote. Cover that first mount as well as
    // a sheet already mounted, and React's effect replay, without counting a return-visit ask too.
    const sheet = (
      <React.StrictMode>
        <SaveVotesSheet />
      </React.StrictMode>
    );
    const view = alreadyMounted ? render(sheet) : null;

    cast('a');
    if (!alreadyMounted) render(sheet);

    expect(screen.getByText('Save your vote')).toBeInTheDocument();
    expect(mocks.impression.mock.calls).toEqual([[reason, 1]]);
    expect(readLocalVotes().prompt.shownCount).toBe(1);
    view?.rerender(sheet);
    expect(mocks.impression).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    cast('a', 'negative');
    expect(readSaveVotesPrompt()).toBeNull();
    for (const entityId of ['b', 'c', 'd']) {
      cast(entityId);
      expect(readSaveVotesPrompt()).toBeNull();
    }
    expect(mocks.impression).toHaveBeenCalledOnce();

    cast('e');
    expect(screen.getByText('Save your 5 votes')).toBeInTheDocument();
    expect(mocks.impression.mock.calls).toEqual([
      [reason, 1],
      ['repeat', 5],
    ]);
    expect(readLocalVotes().prompt.shownCount).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    cast('f');
    expect(readSaveVotesPrompt()).toBeNull();
    expect(mocks.impression).toHaveBeenCalledTimes(2);
  });

  it('asks a visitor who came from one of our emails to log in, not sign up (GEO-3374)', () => {
    noteEmailArrival('?ref_email=welcome');
    vote('a', 'Couples should keep separate finances');
    markPromptedThisSession();
    // Pages after the landing: the URL no longer carries `ref_email`, the session still knows. An ask
    // that isn't the vote link's own keeps the corner card, with the login wording.
    window.history.replaceState(null, '', '/explore');
    render(<SaveVotesSheet />);

    act(() => openSaveVotesPrompt('single_claim'));
    const region = screen.getByRole('region', { name: 'Save your votes' });
    expect(region).toHaveTextContent('Log in to save your vote');
    expect(region).toHaveTextContent('Log in to make it count.');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('opens centred for the vote an email link cast, with that vote as its chip (GEO-3374)', () => {
    noteEmailArrival('?ref_email=welcome');
    vote('a', 'Couples should keep separate finances');
    markPromptedThisSession();
    render(<SaveVotesSheet />);

    act(() => openSaveVotesPrompt('email_link'));
    const dialog = screen.getByRole('dialog', { name: 'Save your votes' });
    expect(dialog).toHaveTextContent('Log in to save your vote');
    expect(screen.getByRole('list', { name: 'Your votes' })).toHaveTextContent('Couples should keep separate finances');
    expect(screen.queryByRole('region', { name: 'Save your votes' })).not.toBeInTheDocument();
    expect(mocks.impression).toHaveBeenCalledWith('email_link', 1);
    // An automatic ask: it counts toward when the sheet asks again, as the pill's own first ask would.
    expect(readLocalVotes().prompt.shownCount).toBe(1);
  });

  it('keeps the sign-up wording for a visit that did not come from an email', () => {
    vote('a');
    markPromptedThisSession();
    render(<SaveVotesSheet />);

    act(() => openSaveVotesPrompt('single_claim'));
    expect(screen.getByText('Save your vote')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
  });

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

  it('keeps Save off until the address looks like an email', () => {
    vote('a');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('single_claim'));
    const field = screen.getByRole('textbox', { name: 'Email address' });
    const save = screen.getByRole('button', { name: 'Save vote' });

    expect(save).toBeDisabled();
    fireEvent.change(field, { target: { value: 'sam@hey' } });
    expect(save).toBeDisabled();
    // Enter in the field submits the form even with the button off; that must not send either.
    fireEvent.submit(field.closest('form')!);
    expect(mocks.beginPrivyAuth).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'sam@hey.com' } });
    expect(save).toBeEnabled();
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

  it('says what happens next under the button', () => {
    vote('a');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('single_claim'));

    expect(screen.getByRole('region', { name: 'Save your votes' })).toHaveTextContent(
      'We’ll email you a 6-digit code. No password.'
    );
  });

  describe('going back to change the address (GEO-3439)', () => {
    function sendCodeTo(address: string) {
      vote('a');
      vote('b');
      markPromptedThisSession();
      render(<SaveVotesSheet />);
      act(() => openSaveVotesPrompt('threshold'));
      fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: address } });
      fireEvent.click(screen.getByRole('button', { name: 'Save votes' }));
    }

    it.each([
      ['the back arrow', 'Back to email'],
      ['Change beside the address', 'Change'],
    ])('%s returns to the email step with the address kept and focused', (_, control) => {
      sendCodeTo('sam@hey.con');
      fireEvent.click(screen.getByRole('button', { name: control }));

      const field = screen.getByRole('textbox', { name: 'Email address' });
      expect(field).toHaveValue('sam@hey.con');
      expect(field).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument();
      expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Back to email' })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Save your votes' })).toHaveTextContent(
        'We’ll email you a 6-digit code. No password.'
      );
      // Still the visitor's sign-in, and still their votes.
      expect(mocks.cancelPrivyAuth).not.toHaveBeenCalled();
      expect(readLocalVotes().votes).toHaveLength(2);
      expect(readLocalVotes().prompt.dismissCount).toBe(0);
    });

    it('sends a code to the corrected address', () => {
      sendCodeTo('sam@hey.con');
      fireEvent.click(screen.getByRole('button', { name: 'Back to email' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'sam@hey.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send code' }));

      expect(screen.getByText('Enter the code we sent to sam@hey.com')).toBeInTheDocument();
      expect(mocks.accountStepMounts).toBe(2);
      expect(mocks.beginPrivyAuth).toHaveBeenCalledTimes(2);
      expect(mocks.beginPrivyAuth).toHaveBeenLastCalledWith(expect.objectContaining({ prompt_reason: 'threshold' }));
      expect(readLocalVotes().votes).toHaveLength(2);
    });

    it('draws the code step at the corner card’s size', () => {
      sendCodeTo('sam@hey.com');

      expect(mocks.accountStepClasses).toEqual(codeStepClasses(true));
    });

    it('a fresh ask after leaving mid-edit is the plain email step again', () => {
      sendCodeTo('sam@hey.con');
      fireEvent.click(screen.getByRole('button', { name: 'Back to email' }));
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
      act(() => openSaveVotesPrompt('repeat'));

      expect(screen.getByRole('button', { name: 'Save votes' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Send code' })).not.toBeInTheDocument();
    });

    it('closing after going back still withdraws the sign-in', () => {
      sendCodeTo('sam@hey.con');
      fireEvent.click(screen.getByRole('button', { name: 'Back to email' }));
      fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

      expect(mocks.cancelPrivyAuth).toHaveBeenCalled();
      expect(readSaveVotesPrompt()).toBeNull();
      expect(readLocalVotes().votes).toHaveLength(2);
    });
  });

  // GEO-3400: email is the sheet's one way in; Privy's other methods are left to the app's other sign-ins.
  it('offers no other way to sign in', () => {
    vote('a');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('inline_save'));

    expect(screen.getByRole('region', { name: 'Save your votes' })).not.toHaveTextContent('Other ways to sign in');
    expect(
      screen.getAllByRole('button').map(button => button.textContent || button.getAttribute('aria-label'))
    ).toEqual(['Not now', 'Save vote']);
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
    // One row in the corner card, the "+1" on it.
    expect(Array.from(chips.children).map(row => row.textContent)).toEqual(['Agree:Third claimAgree:Second claim+1']);
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
    const view = render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('navbar'));
    return view;
  };

  it('draws the code step at the centred dialog’s size (GEO-3439)', () => {
    openFromNavbar();
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'sam@hey.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save votes' }));

    expect(mocks.accountStepClasses).toEqual(codeStepClasses(false));
  });

  it('stays centred on the way back from the code step (GEO-3439)', () => {
    openFromNavbar();
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'sam@hey.con' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save votes' }));
    // A new ask meanwhile must not move the sheet out from under the visitor on the way back.
    act(() => openSaveVotesPrompt('repeat'));
    fireEvent.click(screen.getByRole('button', { name: 'Back to email' }));

    expect(screen.getByRole('dialog', { name: 'Save your votes' })).toHaveTextContent('Send code');
    expect(screen.queryByRole('region', { name: 'Save your votes' })).not.toBeInTheDocument();
  });

  it('is a centred modal dialog with the corner card’s content', () => {
    openFromNavbar();

    const dialog = screen.getByRole('dialog', { name: 'Save your votes' });
    expect(dialog).toHaveTextContent('Save your 2 votes');
    expect(dialog).not.toHaveTextContent('Other ways to sign in');
    expect(screen.getByRole('list', { name: 'Your votes' })).toHaveTextContent('Second claim');
    expect(screen.queryByRole('region', { name: 'Save your votes' })).not.toBeInTheDocument();
    expect(mocks.impression).toHaveBeenCalledWith('navbar', 2);
  });

  // The debate feed's phone bar has the same "Save N votes" pill (GEO-3415), and opens it the same way.
  it('opens centred from the debate feed’s phone bar too, named as the bar', () => {
    vote('a');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('debate_feed_bar'));

    expect(screen.getByRole('dialog', { name: 'Save your votes' })).toBeInTheDocument();
    expect(mocks.impression).toHaveBeenCalledWith('debate_feed_bar', 1);
    expect(readLocalVotes().prompt.shownCount).toBe(0);
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

  it('tags its sign-in with the navbar', () => {
    openFromNavbar();
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'sam@hey.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save votes' }));
    expect(mocks.beginPrivyAuth).toHaveBeenCalledWith(
      expect.objectContaining({ auth_control: 'email', prompt_reason: 'navbar' })
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('Enter the code we sent to sam@hey.com');
  });

  it('shows a second row of votes before the "+N"', () => {
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach(id => vote(id, `Claim ${id}`));
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('navbar'));

    const chips = within(screen.getByRole('list', { name: 'Your votes' }));
    expect(chips.getAllByRole('listitem').map(chip => chip.textContent)).toEqual([
      'Agree:Claim f',
      'Agree:Claim e',
      'Agree:Claim d',
      'Agree:Claim c',
      '+2',
    ]);
    // Two rows of two, the "+2" closing the second rather than starting a third.
    expect(Array.from(screen.getByRole('list', { name: 'Your votes' }).children).map(row => row.textContent)).toEqual([
      'Agree:Claim fAgree:Claim e',
      'Agree:Claim dAgree:Claim c+2',
    ]);
  });

  // The code step falls back to Privy's dialog when it cannot send a code. The centred modal would
  // hold focus and pointer events away from it, so it hands over instead, keeping the votes.
  it('hands over to Privy’s dialog when the code step falls back to it', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const view = openFromNavbar();
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'sam@hey.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save votes' }));

    mocks.isModalOpen = true;
    view.rerender(<SaveVotesSheet />);

    expect(readSaveVotesPrompt()).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.cancelPrivyAuth).not.toHaveBeenCalled();
    expect(readLocalVotes().prompt.dismissCount).toBe(0);
    expect(readLocalVotes().votes).toHaveLength(2);
    // Privy's dialog owns focus now; the sheet must not pull it back to the navbar on its way out.
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));
    expect(document.activeElement).not.toBe(opener);
    opener.remove();
  });

  it('closes on Escape and keeps the votes, like the corner card', () => {
    openFromNavbar();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(readSaveVotesPrompt()).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(readLocalVotes().prompt.dismissCount).toBe(1);
    expect(readLocalVotes().votes).toHaveLength(2);
  });

  // Copilot on #2933: the two presentations are different trees, so switching mid-code remounted the
  // code step — clearing what was typed and mailing a second code.
  it('leaves a code step where it is when the navbar is pressed', () => {
    vote('a');
    vote('b');
    markPromptedThisSession();
    render(<SaveVotesSheet />);
    act(() => openSaveVotesPrompt('threshold'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'sam@hey.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save votes' }));
    expect(mocks.accountStepMounts).toBe(1);
    mocks.impression.mockClear();

    act(() => openSaveVotesPrompt('navbar'));

    expect(screen.getByRole('region', { name: 'Save your votes' })).toHaveTextContent('sam@hey.com');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.accountStepMounts).toBe(1);
    expect(mocks.impression).not.toHaveBeenCalled();
  });

  // Copilot on #2933: Radix puts `pointer-events: auto` on its content, so content that filled the
  // screen took every press beside the card as a press inside it.
  it('closes on a press beside the card, keeping the votes', async () => {
    openFromNavbar();
    const card = screen.getByRole('dialog', { name: 'Save your votes' });
    // Radix starts listening for outside presses a tick after it opens.
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));

    // A whole press: Radix dismisses on the click that follows a left-button pointer-down.
    const beside = card.parentElement!;
    fireEvent.pointerDown(beside, { button: 0 });
    fireEvent.click(beside);

    expect(readSaveVotesPrompt()).toBeNull();
    expect(readLocalVotes().prompt.dismissCount).toBe(1);
    expect(readLocalVotes().votes).toHaveLength(2);
  });

  // Pins the structure, deliberately: jsdom does no hit-testing, so the press above lands on the
  // backdrop whatever is drawn over it. In a browser, a dialog element that fills the screen takes
  // every press beside the card (Radix sets `pointer-events: auto` on it), and none of them dismiss.
  it('makes the card itself the dialog, with nothing full-screen inside the backdrop', () => {
    openFromNavbar();
    const dialog = screen.getByRole('dialog', { name: 'Save your votes' });

    expect(dialog).toHaveClass('w-[360px]');
    expect(dialog).not.toHaveClass('inset-0');
    expect(dialog.parentElement).toHaveClass('fixed', 'inset-0');
  });

  // Copilot on #2933: with no Radix trigger, closing left focus on the page body.
  it('hands focus back to what opened it', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    openFromNavbar();
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement));

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
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
