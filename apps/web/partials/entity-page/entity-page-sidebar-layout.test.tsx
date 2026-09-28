import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { EntityPageSidebarLayout } from './entity-page-sidebar-layout';
import { StickySideRail } from './sticky-side-rail';

describe('EntityPageSidebarLayout', () => {
  afterEach(cleanup);

  it('stays on auto-sidebar so an empty panel can collapse via has-[aside]', () => {
    render(<EntityPageSidebarLayout>Body</EntityPageSidebarLayout>);

    const container = screen.getByText('Body').closest('[data-entity-page-content-variant]');

    expect(container?.getAttribute('data-entity-page-content-variant')).toBe('auto-sidebar');
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('renders the sidebar aside when one is provided', () => {
    render(<EntityPageSidebarLayout sidebar={<StickySideRail>Rail</StickySideRail>}>Body</EntityPageSidebarLayout>);

    const rail = screen.getByRole('complementary');

    // Fluid between the two tokens rather than a flat 360px: a fixed rail was what starved the
    // feed beside it between 1024px and ~1200px (GEO-2774).
    expect([...rail.classList]).toContain('w-[min(var(--width-side-rail),32%)]');
    expect([...rail.classList]).toContain('min-w-[var(--width-side-rail-min)]');
    // Still shrink-0, so flexbox cannot take it under the floor — past the floor it is dropped.
    expect([...rail.classList]).toContain('shrink-0');
    expect([...rail.classList]).toContain('lg:hidden');
    expect(rail.textContent).toBe('Rail');
    expect(
      screen
        .getByText('Body')
        .closest('[data-entity-page-content-variant]')
        ?.getAttribute('data-entity-page-content-variant')
    ).toBe('auto-sidebar');
  });
});
