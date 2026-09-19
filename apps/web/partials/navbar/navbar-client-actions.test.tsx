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
  it('hides nothing on mobile', () => {
    const { container } = render(<NavbarClientActions onSearchClick={vi.fn()} />);

    // Asserted against this component's own markup rather than a particular element, so it keeps
    // holding if the structure changes — what matters is that nothing in this row is width-gated.
    expect(container.innerHTML).not.toContain('sm:hidden');
  });
});
