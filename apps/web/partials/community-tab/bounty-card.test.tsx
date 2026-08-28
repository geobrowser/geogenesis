import { render } from '@testing-library/react';

import * as React from 'react';

import { describe, expect, it, vi } from 'vitest';

import type { SpaceBounty } from '~/core/community/bounty-types';

import { AvailableBountyCard, BountyCard, InProgressBountyCard } from './bounty-card';

vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: vi.fn(), closeSidePanel: vi.fn(), sidePanelTarget: null }),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: null }) }));

vi.mock('~/core/state/sign-in-prompt-store', () => ({
  useSignInPrompt: () => ({ action: null, open: vi.fn(), close: vi.fn() }),
}));

vi.mock('~/design-system/avatar', () => ({ Avatar: () => <div data-testid="avatar" /> }));

function bounty(overrides: Partial<SpaceBounty> = {}): SpaceBounty {
  return {
    id: 'bounty-1',
    spaceId: 'space-1',
    name: 'Add credible sources',
    description: 'Add the sites and outlets this space should be tracking.',
    budget: 500,
    difficulty: 'Easy',
    skills: ['Research'],
    contributors: [],
    isFeatured: false,
    ...overrides,
  } as SpaceBounty;
}

/**
 * GEO-2733. The cards used to carry a fixed pixel width, and the grids had no column definition at
 * all — so how many fit per row was decided by whether that width happened to divide into the
 * content column. It didn't: both grids came up one column short.
 *
 * The column count now lives in the grid (`repeat(auto-fill, minmax(...))`) and a card fills the
 * track it is given. jsdom has no layout engine, so the count itself is verified in a browser, but
 * the half of the contract that lives on the card — carry no width of your own — is checkable here,
 * and it is the half a later edit is most likely to undo.
 */
describe('bounty cards', () => {
  const cases = [
    ['completed', () => <BountyCard bounty={bounty()} />],
    ['in progress', () => <InProgressBountyCard bounty={bounty()} />],
    [
      'available',
      () => (
        <AvailableBountyCard
          bounty={bounty()}
          isInterested={false}
          isPending={false}
          isInterestLoading={false}
          canRegisterInterest
          onRegisterInterest={vi.fn()}
        />
      ),
    ],
  ] as const;

  it.each(cases)('a %s card fills its column rather than setting a width', (_name, renderCard) => {
    const { container } = render(renderCard());

    const card = container.querySelector<HTMLElement>('[data-bounty-card]')!;

    expect(card.style.width).toBe('');
    expect(card.className).toContain('w-full');
  });

  // The fixed height is deliberate and stays — rows are meant to line up, and the cards' line
  // clamps are tuned to it. Only the width was ever the problem.
  it.each(cases)('a %s card keeps its fixed height', (_name, renderCard) => {
    const { container } = render(renderCard());

    const card = container.querySelector<HTMLElement>('[data-bounty-card]')!;

    expect(card.style.height).toMatch(/^\d+px$/);
  });
});
