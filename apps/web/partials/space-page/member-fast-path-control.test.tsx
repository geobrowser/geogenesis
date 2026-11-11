import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemberFastPathControl } from './member-fast-path-control';

const mocks = vi.hoisted(() => ({
  restricted: false,
  loading: false,
  address: '0xdao' as string | undefined,
  runs: {} as Record<string, ReturnType<typeof vi.fn>>,
  status: 'idle',
}));

vi.mock('~/core/hooks/use-space', () => ({
  useSpace: () => ({ space: mocks.address ? { address: mocks.address } : null }),
}));
vi.mock('~/core/hooks/use-fast-path-restricted', () => ({
  useIsFastPathRestricted: () => ({ isFastPathRestricted: mocks.restricted, isLoading: mocks.loading }),
}));
vi.mock('~/core/hooks/use-member-fast-path', () => ({
  useMemberFastPath: ({ action }: { action: string }) => {
    mocks.runs[action] ??= vi.fn();
    return { run: mocks.runs[action], status: mocks.status };
  },
}));

const props = { spaceId: 'space', memberSpaceId: 'member' };

beforeEach(() => {
  mocks.restricted = false;
  mocks.loading = false;
  mocks.address = '0xdao';
  mocks.runs = {};
  mocks.status = 'idle';
});
afterEach(cleanup);

describe('MemberFastPathControl', () => {
  it('marks a restricted person as review only and proposes fast path for them', async () => {
    mocks.restricted = true;
    render(<MemberFastPathControl {...props} />);

    expect(screen.getByText('Review only')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Propose fast path' }));
    expect(mocks.runs.give_fast_path).toHaveBeenCalledWith('member');
  });

  it('lets an editor put someone with fast path on review only', async () => {
    render(<MemberFastPathControl {...props} />);

    expect(screen.queryByText('Review only')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Make review only' }));
    expect(mocks.runs.make_review_only).toHaveBeenCalledWith('member');
  });

  it('says a fast-path proposal was created rather than claiming access changed', () => {
    mocks.restricted = true;
    mocks.status = 'success';
    render(<MemberFastPathControl {...props} />);

    expect(screen.getByRole('button', { name: 'Proposal created' })).toBeDisabled();
  });

  it('renders nothing until the restriction is known', () => {
    mocks.loading = true;
    const { container } = render(<MemberFastPathControl {...props} />);
    expect(container).toBeEmptyDOMElement();
  });
});
