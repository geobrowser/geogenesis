import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

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
