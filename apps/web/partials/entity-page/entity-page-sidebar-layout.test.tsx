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

    expect(screen.getByRole('complementary').textContent).toBe('Rail');
    expect(
      screen
        .getByText('Body')
        .closest('[data-entity-page-content-variant]')
        ?.getAttribute('data-entity-page-content-variant')
    ).toBe('auto-sidebar');
  });
});
