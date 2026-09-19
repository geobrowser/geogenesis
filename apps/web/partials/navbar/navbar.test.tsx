import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/design-system/client-only', () => ({
  ClientOnly: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./navbar-client-actions', () => ({
  NavbarClientActions: () => <div data-testid="client-actions" />,
}));
// Rendered for real, because the shrink path is the thing under test: `min-w-0` on the outer
// group alone does nothing if the chain below it still refuses to go under its content.
vi.mock('./navbar-breadcrumb', () => ({
  NavbarBreadcrumb: () => <div data-testid="breadcrumb-inner" />,
}));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null }) }));
// The metadata reads its space from the route, so the breadcrumb only renders with one present.
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'space-1' }) }));
vi.mock('~/design-system/icons/geo-logo-large', () => ({ GeoLogoLarge: () => <svg /> }));
// Reaches the sync engine through its prefetch behaviour; this suite only needs it to be a link.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { Navbar } from './navbar';

afterEach(cleanup);

describe('Navbar', () => {
  /**
   * The two groups are a fixed-size right and a variable-length left, and neither could give: the
   * left had no `min-w-0`, so it would not shrink below its content, and the right had no
   * `shrink-0`, so it was what compressed. On a narrow phone that squeezed the controls — which,
   * since they came back on mobile, are the only route to an account.
   *
   * Asserted structurally because jsdom has no layout: it reports every width as zero, so an
   * overflow cannot be measured here. What can be pinned is which side is allowed to give.
   */
  it('lets the breadcrumb shrink and holds the controls at their size', () => {
    const { getByTestId, container } = render(<Navbar onSearchClick={vi.fn()} />);

    // `parentElement`, not `closest('div')` — both stand-ins are themselves divs, so `closest`
    // returns the stand-in and reports an empty className.
    const left = getByTestId('breadcrumb-inner').parentElement?.parentElement;
    const right = getByTestId('client-actions').parentElement;

    expect(left?.className ?? '').toContain('min-w-0');
    // And the link in between, which is where the chain used to break: `min-w-0` on the outer
    // group lets it shrink, but a child at the default `min-width: auto` still will not, so the
    // breadcrumb's own `truncate` never gets a constrained width and the text paints outside.
    expect(getByTestId('breadcrumb-inner').parentElement?.className ?? '').toContain('min-w-0');
    expect(right?.className ?? '').toContain('shrink-0');
    expect(container.firstElementChild?.className ?? '').toContain('justify-between');
  });
});
