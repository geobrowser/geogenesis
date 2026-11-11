import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpaceAddBackPrompt } from './space-add-back-prompt';

const MEMBER = '22222222222222222222222222222222';

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  isMember: false,
  restricted: true,
  runs: {} as Record<string, ReturnType<typeof vi.fn>>,
  status: 'idle',
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.params,
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => '/space/abc',
}));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: mocks.isMember, isLoading: false }),
}));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: { address: '0xdao' } }) }));
vi.mock('~/core/hooks/use-fast-path-restricted', () => ({
  useIsFastPathRestricted: () => ({ isFastPathRestricted: mocks.restricted, isLoading: false }),
}));
vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: () => ({ profilesBySpaceId: new Map([[MEMBER, { name: 'Sam' }]]) }),
}));
vi.mock('~/core/hooks/use-member-fast-path', () => ({
  useMemberFastPath: ({ action }: { action: string }) => {
    mocks.runs[action] ??= vi.fn();
    return { run: mocks.runs[action], status: mocks.status };
  },
}));

beforeEach(() => {
  mocks.params = new URLSearchParams({ addBack: MEMBER });
  mocks.isMember = false;
  mocks.restricted = true;
  mocks.runs = {};
  mocks.status = 'idle';
  mocks.replace.mockClear();
});
afterEach(cleanup);

describe('SpaceAddBackPrompt', () => {
  it('stays closed without an add-back link', () => {
    mocks.params = new URLSearchParams();
    render(<SpaceAddBackPrompt spaceId="abc" spaceName="Debates" />);
    expect(screen.queryByText('Add someone back')).not.toBeInTheDocument();
  });

  it('offers to add a locked-out person back, with or without fast path', async () => {
    render(<SpaceAddBackPrompt spaceId="abc" spaceName="Debates" />);
    const user = userEvent.setup();

    expect(screen.getByText(/Sam left Debates while on review only/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add back with fast path' }));
    expect(mocks.runs.add_back_with_fast_path).toHaveBeenCalledWith(MEMBER);
    await user.click(screen.getByRole('button', { name: 'Add back on review only' }));
    expect(mocks.runs.add_back_review_only).toHaveBeenCalledWith(MEMBER);
  });

  // The two-action proposal reverts for someone who isn't restricted, so it is never offered then.
  it('points an unblocked person to the normal request instead of proposing', () => {
    mocks.restricted = false;
    render(<SpaceAddBackPrompt spaceId="abc" spaceName="Debates" />);

    expect(screen.getByText(/can request to join from the space page/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add back/ })).not.toBeInTheDocument();
  });

  it('says when the person is already a member', () => {
    mocks.isMember = true;
    render(<SpaceAddBackPrompt spaceId="abc" spaceName="Debates" />);
    expect(screen.getByText('Sam is already a member of Debates.')).toBeInTheDocument();
  });

  it('removes the link parameter when closed', async () => {
    render(<SpaceAddBackPrompt spaceId="abc" spaceName="Debates" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(mocks.replace).toHaveBeenCalledWith('/space/abc', { scroll: false });
  });
});
