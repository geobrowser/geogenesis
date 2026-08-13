import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpaceChromeGate, SpaceHeaderContentContainer } from './space-chrome-gate';

const navigation = vi.hoisted(() => ({
  pathname: '/space/test-space',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

describe('space chrome layout', () => {
  beforeEach(() => {
    navigation.pathname = '/space/test-space';
  });

  afterEach(cleanup);

  it('aligns the header with the sidebar layout on the space home page', () => {
    render(<SpaceHeaderContentContainer hasSidebar>Header</SpaceHeaderContentContainer>);

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('with-sidebar');
  });

  it('drops the sidebar width on nested space routes, which render no rail', () => {
    navigation.pathname = '/space/test-space/activity';

    render(<SpaceHeaderContentContainer hasSidebar>Header</SpaceHeaderContentContainer>);

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('content');
  });

  it('keeps the readable header width when the home page has no sidebar', () => {
    render(<SpaceHeaderContentContainer hasSidebar={false}>Header</SpaceHeaderContentContainer>);

    expect(screen.getByText('Header').dataset.entityPageContentVariant).toBe('content');
  });

  it('hides the shared chrome on debate routes', () => {
    navigation.pathname = '/space/test-space/debates/debate-id';

    render(<SpaceChromeGate>Header</SpaceChromeGate>);

    expect(screen.queryByText('Header')).toBeNull();
  });
});
