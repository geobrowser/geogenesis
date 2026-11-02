import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavbarAccountActions } from './navbar-account-actions';

const mocks = vi.hoisted(() => ({ authenticated: false }));

vi.mock('~/core/wallet/auth-hooks', () => ({ usePrivy: () => ({ authenticated: mocks.authenticated }) }));
vi.mock('./navbar-actions', () => ({
  NavbarActions: ({ compact, signInComponent }: { compact?: boolean; signInComponent?: string }) => (
    <div data-testid="account" data-compact={String(compact)} data-sign-in-component={signInComponent} />
  ),
}));
vi.mock('~/core/debates/matchmaking/debates-hub-button', () => ({
  DebatesHubButton: ({ compact, placement }: { compact?: boolean; placement?: string }) => (
    <button type="button" data-compact={String(compact)} data-placement={placement}>
      Debate
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  mocks.authenticated = false;
});

describe.each(['navbar', 'debate_feed_bar'] as const)('NavbarAccountActions (%s)', placement => {
  it('shows only compact login while signed out, with the correct sign-in attribution', () => {
    render(<NavbarAccountActions compact placement={placement} />);

    expect(screen.getByTestId('account')).toHaveAttribute('data-compact', 'true');
    expect(screen.getByTestId('account')).toHaveAttribute('data-sign-in-component', placement);
    expect(screen.queryByRole('button', { name: 'Debate' })).not.toBeInTheDocument();
  });

  it('adds the compact Debate button for the same placement once signed in', () => {
    mocks.authenticated = true;
    render(<NavbarAccountActions compact placement={placement} />);

    expect(screen.getByRole('button', { name: 'Debate' })).toHaveAttribute('data-compact', 'true');
    expect(screen.getByRole('button', { name: 'Debate' })).toHaveAttribute('data-placement', placement);
    expect(screen.getByTestId('account')).toHaveAttribute('data-compact', 'true');
  });
});

describe('NavbarAccountActions', () => {
  it('keeps the standard navbar Debate entry available while signed out', () => {
    render(<NavbarAccountActions />);

    expect(screen.getByRole('button', { name: 'Debate' })).toHaveAttribute('data-compact', 'false');
    expect(screen.getByRole('button', { name: 'Debate' })).toHaveAttribute('data-placement', 'navbar');
    expect(screen.getByTestId('account')).toHaveAttribute('data-compact', 'false');
  });

  it('preserves the account controls when changing sizes', () => {
    const { rerender } = render(<NavbarAccountActions />);
    const account = screen.getByTestId('account');

    rerender(<NavbarAccountActions compact />);

    expect(screen.getByTestId('account')).toBe(account);
    expect(account).toHaveAttribute('data-compact', 'true');
  });
});
