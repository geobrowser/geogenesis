import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearLocalVotes, toggleLocalVote } from '../state/local-votes';
import { closeSaveVotesPrompt, readSaveVotesPrompt } from '../state/save-votes-prompt';
import { GeoConnectButton } from './wallet';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  prepareOnboarding: vi.fn(),
  privySignIn: vi.fn(),
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  useGeoLogin: () => ({ login: mocks.login }),
  usePrivy: () => ({ authenticated: false }),
}));
vi.mock('../analytics', () => ({ trackPrivyAuth: vi.fn() }));
vi.mock('../hooks/use-prepare-onboarding', () => ({
  usePrepareOnboarding: () => mocks.prepareOnboarding,
}));
vi.mock('../hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.privySignIn }));

afterEach(() => {
  cleanup();
  clearLocalVotes();
  closeSaveVotesPrompt();
  vi.clearAllMocks();
});

describe('GeoConnectButton', () => {
  it('matches the Debate button height', () => {
    render(<GeoConnectButton />);

    expect(screen.getByRole('button', { name: 'Log in' })).toHaveClass('h-7', '!py-0');
  });

  // GEO-3415. The debate feed's phone bar draws a smaller pill, and keeps a full thumb-sized target.
  describe('compact', () => {
    it('draws a 22px pill inside a 44px target', () => {
      render(<GeoConnectButton compact component="debate_feed_bar" />);

      const button = screen.getByRole('button', { name: 'Log in' });
      expect(button).toHaveClass('h-11', 'min-w-11');
      expect(screen.getByText('Log in')).toHaveClass('h-[22px]');
    });

    it('signs in like the navbar button does', () => {
      render(<GeoConnectButton compact component="debate_feed_bar" />);

      fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

      expect(mocks.prepareOnboarding).toHaveBeenCalledWith({ returnTo: null });
      expect(mocks.login).toHaveBeenCalled();
    });

    // GEO-3400: like the navbar's, it opens the save sheet centred, named as the bar.
    it('names the bar as the reason when it opens the save sheet', () => {
      toggleLocalVote({ responseKind: 'stance', entityId: 'a', spaceId: 's', direction: 'positive', title: 'A' });
      render(<GeoConnectButton compact component="debate_feed_bar" />);

      fireEvent.click(screen.getByRole('button', { name: 'Save 1 vote' }));

      expect(readSaveVotesPrompt()).toBe('debate_feed_bar');
      expect(mocks.privySignIn).not.toHaveBeenCalled();
    });
  });

  // GEO-3214: with votes waiting on this device, the pill is a save prompt. GEO-3400: it opens the
  // save sheet, centred, whose own sign-ins save the votes, rather than Privy's dialog.
  it('offers to save the votes on this device, and opens the save sheet', () => {
    toggleLocalVote({ responseKind: 'stance', entityId: 'a', spaceId: 's', direction: 'positive', title: 'A' });
    toggleLocalVote({ responseKind: 'stance', entityId: 'b', spaceId: 's', direction: 'negative', title: 'B' });
    render(<GeoConnectButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Save 2 votes' }));

    expect(readSaveVotesPrompt()).toBe('navbar');
    expect(mocks.privySignIn).not.toHaveBeenCalled();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('says "Save 1 vote" for one', () => {
    toggleLocalVote({ responseKind: 'stance', entityId: 'a', spaceId: 's', direction: 'positive', title: 'A' });
    render(<GeoConnectButton />);
    expect(screen.getByRole('button', { name: 'Save 1 vote' })).toBeInTheDocument();
  });
});
