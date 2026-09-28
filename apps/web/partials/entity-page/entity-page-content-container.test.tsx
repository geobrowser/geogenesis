import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { EntityPageContentContainer } from './entity-page-content-container';
import { EntityPageSidebarLayout } from './entity-page-sidebar-layout';

afterEach(cleanup);

describe('EntityPageContentContainer', () => {
  it('uses the readable content width by default', () => {
    render(<EntityPageContentContainer>Content</EntityPageContentContainer>);

    const container = screen.getByText('Content');

    expect(container?.dataset.entityPageContentVariant).toBe('content');
    expect(container?.className).toContain('max-w-[var(--entity-page-content-max-width)]');
    expect(container?.style.getPropertyValue('--entity-page-content-max-width')).toBe('900px');
  });

  it('uses the desktop sidebar width with a readable-width fallback', () => {
    render(<EntityPageContentContainer variant="with-sidebar">Content</EntityPageContentContainer>);

    const container = screen.getByText('Content');

    expect(container?.dataset.entityPageContentVariant).toBe('with-sidebar');
    expect(container?.className).toContain('max-w-[var(--entity-page-with-sidebar-max-width)]');
    expect(container?.className).toContain('lg:max-w-[var(--entity-page-content-max-width)]');
    expect(container?.style.getPropertyValue('--entity-page-with-sidebar-max-width')).toBe('1142px');
  });
});

describe('EntityPageSidebarLayout', () => {
  it('sizes from the rendered aside via the auto-sidebar variant', () => {
    render(<EntityPageSidebarLayout>Content</EntityPageSidebarLayout>);

    const container = screen.getByText('Content').closest('[data-entity-page-content-variant]');

    expect(container?.getAttribute('data-entity-page-content-variant')).toBe('auto-sidebar');
    expect(container?.className).toContain('has-[aside]:max-w-[var(--entity-page-with-sidebar-max-width)]');
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('renders the sidebar aside when one is provided', () => {
    render(<EntityPageSidebarLayout sidebar={<aside>Sidebar</aside>}>Content</EntityPageSidebarLayout>);

    const container = screen.getByText('Content').closest('[data-entity-page-content-variant]');

    expect(container?.getAttribute('data-entity-page-content-variant')).toBe('auto-sidebar');
    expect(screen.getByRole('complementary').textContent).toBe('Sidebar');
  });
});

/**
 * The avatar's box follows the same column, at the same breakpoint.
 *
 * `EntityPageContentContainer` narrows a with-sidebar column back to 900px at
 * `lg` — a max-width of 1023px here — because the rail drops itself there. The
 * avatar is centred in a box the width of that column so its left edge lands on
 * the name below it; a fixed 1142 left the box viewport-wide between 901 and
 * 1023px while the name centred at 900, sliding the avatar up to 121px left of
 * the name in exactly one band of widths.
 *
 * Asserted on the class pair rather than a rendered width, since jsdom has no
 * layout — but the pair is the whole fix, and the variables have to be declared
 * on the element itself because the container's copy is scoped to the container.
 */
describe('the profile avatar box', () => {
  it('carries the same responsive width pair as the with-sidebar column', () => {
    render(<EntityPageContentContainer variant="with-sidebar">Content</EntityPageContentContainer>);

    const container = screen.getByText('Content');
    const pair = [
      'max-w-[var(--entity-page-with-sidebar-max-width)]',
      'lg:max-w-[var(--entity-page-content-max-width)]',
    ];

    for (const className of pair) {
      expect(container?.className).toContain(className);
    }

    // Both variables resolve on the element that uses them.
    expect(container?.style.getPropertyValue('--entity-page-with-sidebar-max-width')).toBe('1142px');
    expect(container?.style.getPropertyValue('--entity-page-content-max-width')).toBe('900px');
  });
});
