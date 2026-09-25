import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityVoteButtons } from './entity-vote-buttons';

/**
 * The responder faces are a handle, not a decoration.
 *
 * They are pictures of the people the list names, so they are what a reader reaches for — but only
 * the tally beside them was ever wired to the popover, and the cluster looked like a control and did
 * nothing. `ClaimSideResponders` already opens the same list from the same faces on the claim hero.
 */
const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({
  positive: 2,
  negative: 1,
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ authenticated: false }),
  useGeoLogin: () => ({ login: vi.fn() }),
}));

vi.mock('~/core/analytics', () => ({
  downvoted: vi.fn(),
  trackPrivyAuth: vi.fn(),
  upvoted: vi.fn(),
  voteCast: vi.fn(),
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: () => ({
    submitResponse: vi.fn(),
    submitResponseAsync: vi.fn(),
    optimisticResponse: undefined,
    isResponseIndexingDelayed: false,
    isConnected: true,
    personalSpaceId: 'profile-1',
  }),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: {} }) }));

vi.mock('~/core/io/queries', () => ({
  getClaimResponseSummaryPage: () => Effect.succeed([]),
  getEntityResponseCounts: () => Effect.succeed({ positive: mocks.positive, negative: mocks.negative }),
  getEntityResponders: () => Effect.succeed([]),
  getSpaces: () => Effect.succeed([]),
  getUserEntityResponse: () => Effect.succeed(null),
}));

vi.mock('~/core/io/subgraph/fetch-profile', () => ({ fetchProfilesBySpaceIds: () => Effect.succeed([]) }));
vi.mock('~/core/state/pending-personal-space', () => ({ usePendingPersonalSpace: () => ({ isPending: false }) }));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null, isLoading: false }) }));

// Stood in for, so the trigger around it is what the test is looking at rather than the avatar
// stack's own network reads.
vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({
  ClaimResponderAvatars: () => <span data-testid="responder-faces" />,
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function facesTrigger() {
  return screen.getByTestId('responder-faces').closest('button');
}

beforeEach(() => {
  mocks.positive = 2;
  mocks.negative = 1;
});

afterEach(cleanup);

describe('the responder faces on a claim', () => {
  it('are a button that opens the responder list', async () => {
    const user = userEvent.setup();
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" />, { wrapper });

    await waitFor(() => expect(facesTrigger()).not.toBeNull());

    const trigger = facesTrigger()!;
    expect(trigger).toHaveAttribute('aria-label', 'View stances');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    await waitFor(() => expect(facesTrigger()).toHaveAttribute('aria-expanded', 'true'));
  });

  it('leaves the tally its own trigger, so either half opens the list', async () => {
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" />, { wrapper });

    // Two independent popovers, so opening one cannot leave the other's `aria-expanded` lying.
    await waitFor(() => expect(screen.getAllByTitle('View stances')).toHaveLength(2));
    const [faces, tally] = screen.getAllByTitle('View stances');
    expect(faces).toContainElement(screen.getByTestId('responder-faces'));
    expect(tally).toHaveTextContent('67%');
  });

  /**
   * A trigger around nothing is an invisible tab stop with a tooltip: `ClaimResponderAvatars` draws
   * nothing until there is somebody to draw.
   */
  it('stay a plain span while nobody has responded', async () => {
    mocks.positive = 0;
    mocks.negative = 0;
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" />, { wrapper });

    await screen.findByTestId('responder-faces');
    expect(facesTrigger()).toBeNull();
  });

  it('are not drawn at all for a plain entity, which has no responder faces', async () => {
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, { wrapper });

    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('responder-faces')).toBeNull();
  });
});
