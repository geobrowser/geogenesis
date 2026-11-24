import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, expect, it, vi } from 'vitest';

import type { Entity } from '~/core/types';

import { DebateRow } from './claim-debates';

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));

afterEach(cleanup);

it('identifies the debate destination as requiring its full-page player', () => {
  render(
    <DebateRow
      debate={{ id: 'debate-1', name: 'Ada vs. Ben' } as Entity}
      spaceId="claim-space"
      sides={[]}
      profilesBySpaceId={new Map()}
      winnerShare={null}
      keyframeUrl={null}
    />
  );
  const link = screen.getByRole('link');
  expect(link).toHaveAttribute('href', '/space/claim-space/debate-1');
  expect(link).toHaveAttribute('data-entity-side-panel-full-page');
});

it("records the claim page as where the debate's full screen closes back to (GEO-3833)", () => {
  window.sessionStorage.removeItem('geo:debate-full-return');
  render(
    <DebateRow
      debate={{ id: 'debate-1', name: 'Ada vs. Ben' } as Entity}
      spaceId="claim-space"
      sides={[]}
      profilesBySpaceId={new Map()}
      winnerShare={null}
      keyframeUrl={null}
    />
  );
  const link = screen.getByRole('link');
  link.addEventListener('click', event => event.preventDefault());
  fireEvent.click(link);
  const stored = JSON.parse(window.sessionStorage.getItem('geo:debate-full-return') ?? 'null');
  expect(stored).toMatchObject({ from: window.location.pathname, to: '/space/claim-space/debate-1' });
});
