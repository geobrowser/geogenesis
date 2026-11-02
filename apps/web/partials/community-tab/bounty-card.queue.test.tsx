import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpaceBounty } from '~/core/community/bounty-types';
import { pendingActionsAtom } from '~/core/state/pending-actions';

import { AvailableBountyCard } from './bounty-card';

vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => () => {} }));
vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: vi.fn(), closeSidePanel: vi.fn(), sidePanelTarget: null }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: '0xviewer' } } }),
}));
const mocks = vi.hoisted(() => ({ accountSetupPending: true }));
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: mocks.accountSetupPending }),
}));
vi.mock('~/design-system/avatar', () => ({ Avatar: () => null }));

const bounty = {
  id: 'bounty-1',
  spaceId: 'space-1',
  name: 'Add credible sources',
  description: null,
  budget: 500,
  difficulty: 'Easy',
  skills: [],
  contributors: [],
  isFeatured: false,
} as unknown as SpaceBounty;

let store = createStore();
const wrapper = ({ children }: { children: ReactNode }) => <JotaiProvider store={store}>{children}</JotaiProvider>;

beforeEach(() => {
  store = createStore();
  mocks.accountSetupPending = true;
});
afterEach(cleanup);

/**
 * A replay acts on the viewer's interest, so it waits for a successful read of it. A failed read is
 * not loading either — and its empty answer says "not interested", which for someone who had applied
 * would publish a duplicate.
 */
describe('replaying queued interest on a board card', () => {
  it('waits for the viewer’s interest to be read successfully, not merely to stop loading', async () => {
    const register = vi.fn().mockResolvedValue(true);
    const card = ({
      canRegisterInterest,
      isInterestKnown,
    }: {
      canRegisterInterest: boolean;
      isInterestKnown: boolean;
    }) => (
      <AvailableBountyCard
        bounty={bounty}
        isInterested={false}
        isPending={false}
        isInterestLoading={false}
        isInterestKnown={isInterestKnown}
        canRegisterInterest={canRegisterInterest}
        onRegisterInterest={register}
      />
    );
    // Pressed while the new account's space is still being made: queued.
    const view = render(card({ canRegisterInterest: false, isInterestKnown: false }), { wrapper });
    fireEvent.click(screen.getByRole('button', { name: "I'm interested" }));
    const [action] = store.get(pendingActionsAtom);
    expect(action).toBeDefined();

    // The space exists, but the interest read failed: finished, not loading, and empty.
    mocks.accountSetupPending = false;
    view.rerender(card({ canRegisterInterest: true, isInterestKnown: false }));
    let settled = false;
    const running = Promise.resolve(action!.run()).then(() => (settled = true));
    await act(async () => {});
    expect(settled).toBe(false);
    expect(register).not.toHaveBeenCalled();

    // A successful read — not interested after all — and the replay goes.
    view.rerender(card({ canRegisterInterest: true, isInterestKnown: true }));
    await act(() => running);
    expect(register).toHaveBeenCalledOnce();
  });
});
