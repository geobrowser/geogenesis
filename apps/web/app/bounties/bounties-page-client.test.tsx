import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BountiesPageClient } from './bounties-page-client';

const mocks = vi.hoisted(() => ({
  enabled: true,
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('~/core/bounties/config', () => ({
  useBountiesEnabled: () => mocks.enabled,
}));
vi.mock('~/partials/bounties/new-bounty-button', () => ({
  NewBountyButton: () => <div data-testid="new-bounty-button-slot" />,
}));
vi.mock('~/partials/bounties', () => ({
  BountyBoard: ({ header }: { header: React.ReactNode }) => <div data-testid="board">{header}</div>,
}));

afterEach(cleanup);

describe('BountiesPageClient', () => {
  it('renders the board with its heading when the flag is on', () => {
    mocks.enabled = true;
    render(<BountiesPageClient />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bounties' })).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('routes away and renders nothing when the flag is off', () => {
    mocks.enabled = false;
    render(<BountiesPageClient />);
    expect(screen.queryByTestId('board')).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledWith('/root');
  });
});
