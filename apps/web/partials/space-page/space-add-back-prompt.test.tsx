import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { memberFastPathMock, resetMemberFastPathMock } from '~/core/hooks/use-member-fast-path.mock';

import { SpaceAddBackPrompt } from './space-add-back-prompt';

const MEMBER = '22222222222222222222222222222222';

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  readSpaceMembership: vi.fn(),
  restriction: { isRestricted: true as boolean | undefined, isLoading: false, isError: false },
  proposeAddMember: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.params,
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => '/space/abc',
}));
vi.mock('~/core/utils/contracts/read-space-membership', () => ({ readSpaceMembership: mocks.readSpaceMembership }));
vi.mock('~/core/hooks/use-member-fast-path', () => import('~/core/hooks/use-member-fast-path.mock'));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: { address: '0xdao' } }) }));
vi.mock('~/core/hooks/use-fast-path-restricted', () => ({ useFastPathRestriction: () => mocks.restriction }));
vi.mock('~/core/hooks/use-propose-add-member', () => ({
  useProposeAddMember: () => ({ proposeAddMember: mocks.proposeAddMember, status: 'idle' }),
}));
vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: () => ({ profilesBySpaceId: new Map([[MEMBER, { name: 'Sam' }]]) }),
}));

function renderPrompt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SpaceAddBackPrompt spaceId="abc" spaceName="Debates" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMemberFastPathMock();
  mocks.params = new URLSearchParams({ addBack: MEMBER });
  mocks.readSpaceMembership.mockResolvedValue(false);
  mocks.restriction = { isRestricted: true, isLoading: false, isError: false };
});
afterEach(cleanup);

describe('SpaceAddBackPrompt', () => {
  it('stays closed without a usable add-back link', () => {
    mocks.params = new URLSearchParams({ addBack: 'not-an-id' });
    renderPrompt();
    expect(screen.queryByText('Add someone back')).not.toBeInTheDocument();
  });

  it('offers to add a locked-out person back, with or without fast path', async () => {
    renderPrompt();
    const user = userEvent.setup();

    expect(await screen.findByText(/Sam is on review only in Debates/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add back with fast path' }));
    expect(memberFastPathMock.runs.add_back_with_fast_path).toHaveBeenCalledWith(MEMBER);
    await user.click(screen.getByRole('button', { name: 'Add back on review only' }));
    expect(mocks.proposeAddMember).toHaveBeenCalledWith({ targetMemberSpaceId: MEMBER, votingMode: 'fast' });
  });

  // Links are pasted around; a dashed or 0x-prefixed id must reach the same person.
  it('normalizes the id in the link', async () => {
    mocks.params = new URLSearchParams({ addBack: '0x22222222-2222-2222-2222-222222222222' });
    renderPrompt();

    expect(await screen.findByText(/Sam is on review only/)).toBeInTheDocument();
    expect(mocks.readSpaceMembership).toHaveBeenCalledWith('abc', MEMBER);
  });

  it('points an unblocked person to the normal request instead of proposing', async () => {
    mocks.restriction.isRestricted = false;
    renderPrompt();

    expect(await screen.findByText(/can request to join from the space page/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add back/ })).not.toBeInTheDocument();
  });

  it('says when the person is already a member', async () => {
    mocks.readSpaceMembership.mockResolvedValue(true);
    renderPrompt();
    expect(await screen.findByText('Sam is already a member of Debates.')).toBeInTheDocument();
  });

  // Reading a failure as "not a member" would offer a proposal that reverts.
  it('offers nothing when membership could not be checked', async () => {
    mocks.readSpaceMembership.mockRejectedValue(new Error('rpc down'));
    renderPrompt();

    expect(await screen.findByText(/Couldn't check Sam's access/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add back/ })).not.toBeInTheDocument();
  });

  it('removes the link parameter when closed', async () => {
    renderPrompt();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(mocks.replace).toHaveBeenCalledWith('/space/abc', { scroll: false });
  });
});
