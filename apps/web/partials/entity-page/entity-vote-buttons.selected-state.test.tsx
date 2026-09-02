import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResponseKind } from '~/core/responses/entity-response';

import { EntityVoteButtons } from './entity-vote-buttons';
import { VOTE_SELECTED_CLASS } from './vote-button-styles';

/**
 * GEO-2792. Four surfaces had four answers for "this is the one you picked": curation said it with
 * fill alone, stance said `grey-04`, veracity said a hand-written `#2A2B2E`, and the debates pill
 * said blue for up and red for down.
 *
 * These assert the shared class rather than a literal, so the treatment can be changed in one place
 * — but they still fail if a surface stops reading it, which is the drift that produced the ticket.
 */
const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({
  optimisticResponse: undefined as 'positive' | 'negative' | undefined,
}));

vi.mock('@geogenesis/auth', () => ({ useGeoLogin: () => ({ login: vi.fn() }) }));

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
    optimisticResponse: mocks.optimisticResponse,
    isResponseIndexingDelayed: false,
    isConnected: true,
    personalSpaceId: 'profile-1',
  }),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: {} }) }));

vi.mock('~/core/io/queries', () => ({
  getClaimResponseSummaryPage: () => Effect.succeed([]),
  getEntityResponseCounts: () => Effect.succeed({ positive: 2, negative: 1 }),
  getEntityResponders: () => Effect.succeed([]),
  getSpaces: () => Effect.succeed([]),
  getUserEntityResponse: () => Effect.succeed(null),
}));

vi.mock('~/core/io/subgraph/fetch-profile', () => ({ fetchProfilesBySpaceIds: () => Effect.succeed([]) }));
vi.mock('~/core/state/pending-personal-space', () => ({ usePendingPersonalSpace: () => ({ isPending: false }) }));
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: null, isLoading: false }) }));
vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({ ClaimResponderAvatars: () => null }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Inline draws up, the score, then down. The score is a popover trigger, hence the gap. */
function inlineButtons() {
  const buttons = screen.getAllByRole('button');
  return { up: buttons[0]!, down: buttons[2]! };
}

beforeEach(() => {
  mocks.optimisticResponse = undefined;
});

afterEach(cleanup);

describe('the selected vote treatment', () => {
  // Every inline response kind, including curation — which used to get no colour class at all and
  // pinned its arrow to `grey-03`, so a curated row looked the same voted or not.
  describe.each<[string, ResponseKind]>([
    ['curation arrows', 'curation'],
    ['stance thumbs', 'stance'],
    ['veracity chevrons', 'veracity'],
  ])('%s', (_label, responseKind) => {
    it('marks the picked direction with the shared class', () => {
      mocks.optimisticResponse = 'positive';
      render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind={responseKind} />, { wrapper });

      expect(inlineButtons().up).toHaveClass(VOTE_SELECTED_CLASS);
    });

    it('leaves the direction the viewer did not pick grey', () => {
      mocks.optimisticResponse = 'positive';
      render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind={responseKind} />, { wrapper });

      const { down } = inlineButtons();
      expect(down).not.toHaveClass(VOTE_SELECTED_CLASS);
      expect(down).toHaveClass('text-grey-03');
    });
  });

  // The surface the ticket was filed about. `aria-pressed` is what tells the two apart here.
  describe('the debates pill', () => {
    function renderPill() {
      render(
        <EntityVoteButtons
          entityId="entity-1"
          spaceId={SPACE}
          responseKind="curation"
          presentation="debate-horizontal"
        />,
        { wrapper }
      );
      return {
        pressed: screen.getByRole('button', { pressed: true }),
        unpressed: screen.getByRole('button', { pressed: false }),
      };
    }

    it.each([
      ['up', 'positive' as const],
      ['down', 'negative' as const],
    ])('marks a picked %s with the same class as everywhere else', (_direction, response) => {
      mocks.optimisticResponse = response;
      const { pressed } = renderPill();

      expect(pressed).toHaveClass(VOTE_SELECTED_CLASS);
    });

    // The specific complaint: full screen rendered `ctaPrimary` for up and `red-01` for down, the
    // only surface in the app using either for this.
    it.each([
      ['up', 'positive' as const],
      ['down', 'negative' as const],
    ])('no longer colours a picked %s blue or red', (_direction, response) => {
      mocks.optimisticResponse = response;
      const { pressed } = renderPill();

      expect(pressed).not.toHaveClass('text-ctaPrimary');
      expect(pressed).not.toHaveClass('text-red-01');
      expect(pressed.className).not.toMatch(/aria-pressed:text-(ctaPrimary|red-01)/);
    });

    it('leaves the direction the viewer did not pick grey', () => {
      mocks.optimisticResponse = 'positive';
      const { unpressed } = renderPill();

      expect(unpressed).not.toHaveClass(VOTE_SELECTED_CLASS);
      expect(unpressed).toHaveClass('text-grey-04');
    });
  });

  // The token, not a near-black typed by hand. `#2A2B2E` appears in a dozen files and is not in the
  // theme; `text` is, at `#202020`.
  it('uses a theme token rather than a hardcoded colour', () => {
    expect(VOTE_SELECTED_CLASS).toBe('text-text');
  });
});
