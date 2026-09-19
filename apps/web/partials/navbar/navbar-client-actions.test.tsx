import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

// Every occupant of this row is loaded through `next/dynamic`, which resolves asynchronously and
// so puts nothing in the DOM for a synchronous assertion. The wrapper this suite is about is
// rendered by the component itself either way, so the children are irrelevant here.

import { NavbarClientActions } from './navbar-client-actions';

afterEach(cleanup);

describe('NavbarClientActions', () => {
  /**
   * `sm` is max-width 639px in this repo (`styles.css`, `@custom-variant sm`), not Tailwind's usual
   * min-width — so `sm:hidden` on this wrapper hid the account surface on phones while reading like
   * the opposite. That is signing in when logged out, and the avatar, personal space link and sign
   * out when logged in: a phone had no way to reach an account at all.
   *
   * Asserted as the absence of the class rather than by behaviour, because jsdom does not evaluate
   * media queries — a rendering test would pass either way.
   */
  it('does not hide the account surface at any width', () => {
    const { container } = render(<NavbarClientActions onSearchClick={vi.fn()} />);

    // The account surface holds the last slot in the row.
    const row = container.firstElementChild;
    const accountSlot = row?.lastElementChild;

    expect(row?.className).toContain('flex items-center');
    expect(accountSlot).not.toBeNull();
    expect(accountSlot?.className ?? '').not.toContain('hidden');
  });
});
