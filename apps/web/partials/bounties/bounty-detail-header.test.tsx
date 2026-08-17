import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BountyDetailHeader } from './bounty-detail-header';

const mocks = vi.hoisted(() => ({
  detail: { data: undefined as unknown, isLoading: false, isError: false },
  roles: { isEditor: false },
  lastInfoCardProps: null as null | Record<string, unknown>,
}));

vi.mock('~/core/bounties/use-bounty-detail', () => ({
  useBountyDetail: () => mocks.detail,
}));
vi.mock('~/core/bounties/use-bounty-roles', () => ({
  useBountyRoles: () => mocks.roles,
}));
vi.mock('./bounty-info-card', () => ({
  BountyInfoCard: (props: Record<string, unknown>) => {
    mocks.lastInfoCardProps = props;
    return <div data-testid="info-card" />;
  },
}));

beforeEach(() => {
  mocks.detail = { data: undefined, isLoading: false, isError: false };
  mocks.roles = { isEditor: false };
  mocks.lastInfoCardProps = null;
});
afterEach(cleanup);

describe('BountyDetailHeader', () => {
  it('shows a skeleton while loading', () => {
    mocks.detail = { data: undefined, isLoading: true, isError: false };
    render(<BountyDetailHeader spaceId="s" bountyId="b" />);
    expect(document.querySelector('[aria-busy]')).toBeTruthy();
  });

  it('renders nothing on error or when the entity is not a loadable bounty', () => {
    mocks.detail = { data: null, isLoading: false, isError: false };
    const { container, unmount } = render(<BountyDetailHeader spaceId="s" bountyId="b" />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    mocks.detail = { data: undefined, isLoading: false, isError: true };
    const { container: c2 } = render(<BountyDetailHeader spaceId="s" bountyId="b" />);
    expect(c2).toBeEmptyDOMElement();
  });

  it('renders the info card, showing status only to editors', () => {
    mocks.detail = { data: { bounty: { id: 'b' }, interest: [], submissions: [] }, isLoading: false, isError: false };
    const { unmount } = render(<BountyDetailHeader spaceId="s" bountyId="b" />);
    expect(screen.getByTestId('info-card')).toBeInTheDocument();
    expect(mocks.lastInfoCardProps?.showStatus).toBe(false);
    unmount();

    mocks.roles = { isEditor: true };
    render(<BountyDetailHeader spaceId="s" bountyId="b" />);
    expect(mocks.lastInfoCardProps?.showStatus).toBe(true);
  });
});
