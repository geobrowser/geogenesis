import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ZERO_WIDTH_SPACE } from '~/core/constants';

import { EntityPageTitle } from './entity-page-title';

const LONG_NAME =
  'A name long enough that it would have run past the three lines the old header clamped it to, ' +
  'which is exactly the case the responsive token replaced the clamp for.';

afterEach(cleanup);

function renderTitle(props?: Partial<React.ComponentProps<typeof EntityPageTitle>>) {
  return render(
    <EntityPageTitle value="Ada Lovelace" isEditing={false} onChange={vi.fn()} {...props} />
  );
}

/**
 * One token for entity titles, space titles and topic titles. The steps themselves (44/36/26 by
 * viewport, GEO-2460) live in `styles.css`; jsdom applies no stylesheet, so what is assertable here
 * is that the markup reaches for the token rather than restating sizes inline — which is also the
 * thing that drifts.
 */
describe('EntityPageTitle typography', () => {
  it('titles browse mode with the entity title token', () => {
    renderTitle();

    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-entityTitle');
  });

  it('uses the same token for the editing textarea', () => {
    renderTitle({ isEditing: true });

    expect(screen.getByPlaceholderText('Entity name...')).toHaveClass('text-entityTitle');
  });

  it('restates no font size of its own', () => {
    renderTitle();

    const className = screen.getByRole('heading', { level: 1 }).className;
    expect(className).not.toMatch(/text-\[|text-mainPage|leading-\[/);
  });
});

/**
 * The three-line clamp is intentionally gone — the designer asked for it. It compensated for a
 * title fixed at 52px (`mainPage`) at every width; the token now steps down to 26px on a phone.
 *
 * The space header clamped with `Truncate` (no way to reveal the rest); the entity header used
 * `ClampedText`, which does offer a More toggle. So this removes a hard cut on one surface and
 * trades a collapsible one on the other.
 */
describe('EntityPageTitle wrapping', () => {
  it('does not clamp a long name', () => {
    renderTitle({ value: LONG_NAME });

    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveTextContent(LONG_NAME);
    expect(title.className).not.toMatch(/line-clamp|truncate/);
  });

  it('wraps long words instead of overflowing', () => {
    renderTitle({ value: LONG_NAME });

    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('wrap-break-word');
  });

  // A blank name still has to hold the line open, or the row collapses and everything under it
  // jumps as the name hydrates.
  it('keeps the line open when there is no name', () => {
    renderTitle({ value: '' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ZERO_WIDTH_SPACE);
  });
});

describe('EntityPageTitle accessory', () => {
  it('renders alongside the title in browse mode', () => {
    renderTitle({ accessory: <span data-testid="verified" /> });

    expect(screen.getByTestId('verified')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-entityTitle');
  });

  /**
   * The badge is a fixed-height pill next to a title that is now 44, 36 or 26px. Master nudged it
   * with `mt-[9px]`, tuned against a title fixed at 52px — carried over, that offset does not
   * scale, and at 26px it reads as the badge sagging below the name. The row centres it instead.
   */
  it('aligns the accessory by the row rather than a fixed pixel offset', () => {
    renderTitle({ accessory: <span data-testid="verified" /> });

    const wrapper = screen.getByTestId('verified').parentElement;
    expect(wrapper?.className).not.toMatch(/\bm[tby]-\[/);
    expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('items-center');
  });

  // Editing swaps the `h1` for a textarea; an inline badge beside a growing textarea has nowhere
  // to sit, so it is dropped rather than repositioned.
  it('is left out while editing', () => {
    renderTitle({ isEditing: true, accessory: <span data-testid="verified" /> });

    expect(screen.queryByTestId('verified')).toBeNull();
  });
});
