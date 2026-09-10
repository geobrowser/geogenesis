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
 * The three-line clamp the old `Truncate`/`ClampedText` headers applied is intentionally gone: it
 * compensated for a title fixed at 44px on a phone, and the token now steps down to 26px there.
 * A clamped title has no More toggle to reveal the rest, unlike the description below it.
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

  // Editing swaps the `h1` for a textarea; an inline badge beside a growing textarea has nowhere
  // to sit, so it is dropped rather than repositioned.
  it('is left out while editing', () => {
    renderTitle({ isEditing: true, accessory: <span data-testid="verified" /> });

    expect(screen.queryByTestId('verified')).toBeNull();
  });
});
