import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavbarClientActions } from './navbar-client-actions';

/**
 * `next/dynamic` is mocked so the row's children render synchronously.
 *
 * Without this they are absent when the assertion runs, and a test that only inspects the
 * surrounding markup passes whether or not the account surface is there at all — which is what the
 * first version of this did. The regression it guards is "you cannot reach your account on a
 * phone", so it has to see the thing itself.
 */
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    const name = String(loader);
    if (name.includes('navbar-actions')) return () => <div data-testid="navbar-actions" />;
    if (name.includes('create-entity-dropdown')) return () => <div data-testid="create-entity" />;
    return () => <div data-testid="debates-hub" />;
  },
}));

afterEach(cleanup);

describe('NavbarClientActions', () => {
  /**
   * `mobile` is max-width 639px here (`styles.css`, `@custom-variant mobile`), not Tailwind's usual
   * min-width — so `mobile:hidden` on this row hides the account surface on phones. That is signing
   * in when logged out, and the avatar, personal space link and sign out when logged in: a phone had
   * no way to reach an account at all.
   *
   * The width itself cannot be asserted — jsdom does not evaluate media queries — so this checks
   * that the account surface renders and that nothing between it and the root hides it.
   */
  it('renders the account surface with nothing hiding it on mobile', () => {
    const { container } = render(<NavbarClientActions onSearchClick={vi.fn()} />);

    const account = screen.getByTestId('navbar-actions');

    for (let node: HTMLElement | null = account; node; node = node.parentElement) {
      expect(node.className ?? '').not.toContain('hidden');
      if (node === container.firstElementChild) break;
    }

    // At the 320px floor the row keeps every control and tightens only inter-control spacing.
    expect(container.firstElementChild).toHaveClass('max-[359px]:gap-1');
  });

  it('keeps the standalone create control on desktop only', () => {
    render(<NavbarClientActions onSearchClick={vi.fn()} />);

    expect(screen.getByTestId('create-entity').parentElement).toHaveClass('mobile:hidden');
  });

  // Three of the four controls in this row are icon-only. Radix wraps the profile avatar in a
  // button of its own, so an unnamed trigger announces as nothing — and this row is the whole of
  // account access on a phone.
  it('names its icon-only controls', () => {
    render(<NavbarClientActions onSearchClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });
});
