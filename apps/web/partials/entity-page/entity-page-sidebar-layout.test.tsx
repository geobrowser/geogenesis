import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { EntityPageSidebarLayout } from './entity-page-sidebar-layout';

describe('EntityPageSidebarLayout', () => {
  afterEach(cleanup);

  it('collapses to the readable content width when there is no sidebar', () => {
    render(<EntityPageSidebarLayout>Body</EntityPageSidebarLayout>);

    expect(
      screen
        .getByText('Body')
        .closest('[data-entity-page-content-variant]')
        ?.getAttribute('data-entity-page-content-variant')
    ).toBe('content');
  });

  it('reserves the sidebar rail width and renders the sidebar when one is provided', () => {
    render(<EntityPageSidebarLayout sidebar={<aside>Rail</aside>}>Body</EntityPageSidebarLayout>);

    expect(screen.getByText('Rail')).toBeTruthy();
    expect(
      screen
        .getByText('Body')
        .closest('[data-entity-page-content-variant]')
        ?.getAttribute('data-entity-page-content-variant')
    ).toBe('with-sidebar');
  });

  it('collapses to the content width when the sidebar is explicitly false', () => {
    render(<EntityPageSidebarLayout sidebar={false}>Body</EntityPageSidebarLayout>);

    expect(
      screen
        .getByText('Body')
        .closest('[data-entity-page-content-variant]')
        ?.getAttribute('data-entity-page-content-variant')
    ).toBe('content');
  });
});
