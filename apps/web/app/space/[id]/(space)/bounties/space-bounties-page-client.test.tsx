import '@testing-library/jest-dom/vitest';
import * as React from 'react';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpaceBountiesPageClient } from './space-bounties-page-client';

const mocks = vi.hoisted(() => ({
  enabled: true,
  replace: vi.fn(),
  lastSpaceId: undefined as string | undefined,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('~/core/bounties/config', () => ({
  useBountiesEnabled: () => mocks.enabled,
}));
vi.mock('~/partials/bounties', () => ({
  BountyBoard: ({ spaceId }: { spaceId?: string }) => {
    mocks.lastSpaceId = spaceId;
    return <div data-testid="board" />;
  },
}));

afterEach(cleanup);

describe('SpaceBountiesPageClient', () => {
  it('renders the board pinned to the space when the flag is on', () => {
    mocks.enabled = true;
    render(<SpaceBountiesPageClient spaceId="space-1" />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(mocks.lastSpaceId).toBe('space-1');
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('routes back to the space and renders nothing when the flag is off', () => {
    mocks.enabled = false;
    render(<SpaceBountiesPageClient spaceId="space-1" />);
    expect(screen.queryByTestId('board')).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledWith('/space/space-1');
  });
});
