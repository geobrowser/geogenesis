import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { EntityPageContentContainer } from './entity-page-content-container';
import { EntityPageSideRail } from './entity-page-side-rail';
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

describe('EntityPageSideRail', () => {
  it('renders an aside at the fixed rail width so the content column keeps its size', () => {
    render(
      <EntityPageSidebarLayout
        sidebar={
          <EntityPageSideRail>
            <div>Panel</div>
          </EntityPageSideRail>
        }
      >
        Content
      </EntityPageSidebarLayout>
    );

    const rail = screen.getByRole('complementary');

    // A rail that isn't `w-[...] shrink-0` sizes to its own content and squeezes the
    // content column — the community-tab regression this guards against.
    expect(rail.className).toContain('w-[300px]');
    expect(rail.className).toContain('shrink-0');
    expect(rail.textContent).toBe('Panel');
  });

  it('widens the page container, because the auto-sidebar variant keys off the aside', () => {
    render(
      <EntityPageSidebarLayout sidebar={<EntityPageSideRail>Panel</EntityPageSideRail>}>Content</EntityPageSidebarLayout>
    );

    const container = screen.getByText('Content').closest('[data-entity-page-content-variant]');

    expect(container?.className).toContain('has-[aside]:max-w-[var(--entity-page-with-sidebar-max-width)]');
  });
});
