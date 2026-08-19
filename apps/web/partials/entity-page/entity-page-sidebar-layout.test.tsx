import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { EntityPageSidebarLayout } from './entity-page-sidebar-layout';

const variantOf = (text: string) =>
  screen
    .getByText(text)
    .closest('[data-entity-page-content-variant]')
    ?.getAttribute('data-entity-page-content-variant');

describe('EntityPageSidebarLayout', () => {
  afterEach(cleanup);

  // Width is no longer decided here. The layout always asks for `auto-sidebar`
  // and the container's `has-[aside]:` rules widen it only when a sidebar
  // actually renders an <aside> — a panel that returns null for a signed-out
  // viewer, or one with nothing to show, leaves the content at reading width
  // without this component having to know. jsdom applies no CSS, so these cover
  // the contract this component still owns: the variant it requests, and
  // whether the sidebar is rendered at all.
  it('always asks the container to size itself from the rendered sidebar', () => {
    render(<EntityPageSidebarLayout>Body</EntityPageSidebarLayout>);

    expect(variantOf('Body')).toBe('auto-sidebar');
  });

  it('renders the sidebar when one is provided', () => {
    render(<EntityPageSidebarLayout sidebar={<aside>Rail</aside>}>Body</EntityPageSidebarLayout>);

    expect(screen.getByText('Rail')).toBeTruthy();
    expect(variantOf('Body')).toBe('auto-sidebar');
  });

  it('renders no sidebar when it is explicitly false', () => {
    render(<EntityPageSidebarLayout sidebar={false}>Body</EntityPageSidebarLayout>);

    expect(screen.queryByText('Rail')).toBeNull();
    expect(variantOf('Body')).toBe('auto-sidebar');
  });
});
