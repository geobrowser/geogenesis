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
  it('keeps the standard width when there is no sidebar', () => {
    render(<EntityPageSidebarLayout>Content</EntityPageSidebarLayout>);

    const container = screen.getByText('Content').closest('[data-entity-page-content-variant]');

    expect(container?.getAttribute('data-entity-page-content-variant')).toBe('content');
  });

  it('opts into the sidebar width when a sidebar is present', () => {
    render(<EntityPageSidebarLayout sidebar={<aside>Sidebar</aside>}>Content</EntityPageSidebarLayout>);

    const container = screen.getByText('Content').closest('[data-entity-page-content-variant]');

    expect(container?.getAttribute('data-entity-page-content-variant')).toBe('with-sidebar');
    expect(screen.getByRole('complementary').textContent).toBe('Sidebar');
  });
});
