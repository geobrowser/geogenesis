import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResponseKind } from '~/core/responses/entity-response';

import { EntityVoteButtons } from './entity-vote-buttons';
import { VOTE_BUTTON_CLASS } from './vote-button-styles';

/**
 * GEO-2792. Four surfaces had four answers for "this is the one you picked": curation said it with
 * fill alone, stance darkened to `grey-04`, and the debates
 * pill went blue for up and red for down.
 *
 * They now all say it the way curation always did — grey, with the filled icon carrying the signal.
 * The shade is `grey-04` rather than the lighter `grey-03` most of them rested at: these icons are
 * the control, so WCAG 1.4.11 asks 3:1 of them, and `grey-03` gives 2.03:1 on white.
 *
 * The chevrons keep their darker selected colour, since a chevron has no filled form to switch to.
 */
const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

const mocks = vi.hoisted(() => ({
  optimisticResponse: undefined as 'positive' | 'negative' | undefined,
}));

vi.mock('@geogenesis/auth', () => ({
  // `usePrepareOnboarding` reads it to leave a signed-in user's onboarding alone.
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
/**
 * The two direction buttons, picked out by the `group/vote` marker they share rather than by
 * position. The row's button order is not this file's subject and has already changed once — the
 * responder faces became a popover trigger ahead of the up arrow, which silently shifted every
 * index by one.
 */
function inlineButtons() {
  const [up, down] = screen.getAllByRole('button').filter(button => button.className.includes('group/vote'));
  return { up: up!, down: down! };
}

beforeEach(() => {
  mocks.optimisticResponse = undefined;
});

afterEach(cleanup);

describe('the selected vote treatment', () => {
  // Grey in both states. Being picked is said by the icon filling in, not by the colour changing —
  // which is how the curation arrows on tables and Explore have always worked.
  describe.each<[string, ResponseKind]>([
    ['curation arrows', 'curation'],
    ['stance thumbs', 'stance'],
  ])('%s', (_label, responseKind) => {
    it('stays grey whether or not it is the one picked', () => {
      mocks.optimisticResponse = 'positive';
      render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind={responseKind} />, { wrapper });

      const { up, down } = inlineButtons();
      expect(up).toHaveClass('text-grey-04');
      expect(down).toHaveClass('text-grey-04');
    });

    // The thumbs used to darken when picked, which is the drift this closes: the two directions
    // now differ only by fill.
    it('does not colour the picked direction differently from the other', () => {
      mocks.optimisticResponse = 'positive';
      render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind={responseKind} />, { wrapper });

      const { up, down } = inlineButtons();
      expect(up.className).toBe(down.className);
    });
  });

  /**
   * The exception is gone with the chevrons.
   *
   * A veracity claim used to keep its own darker selected colour, because a chevron has no filled
   * form and colour was the only signal it had. Claims are all thumbs now, so the held side is said
   * by the fill and this control has exactly one shade — which is what this pins, since the
   * hand-written `#2A2B2E` that used to override it has been deleted.
   */
  describe('a claim', () => {
    it('takes the same grey as every other control, held or not', () => {
      mocks.optimisticResponse = 'positive';
      render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" />, { wrapper });

      const { up, down } = inlineButtons();
      expect(up).toHaveClass('text-grey-04');
      expect(down).toHaveClass('text-grey-04');
      expect(up.className).toBe(down.className);
    });

    // `cx` concatenates rather than resolving conflicting Tailwind utilities, so a second `text-`
    // class would leave the winner to whichever rule Tailwind emits second. jsdom evaluates no
    // cascade, so only counting them can catch it.
    it('carries exactly one text colour', () => {
      mocks.optimisticResponse = 'positive';
      render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" />, { wrapper });

      expect(inlineButtons().up.className.match(/(^|\s)text-/g) ?? []).toHaveLength(1);
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

    it('reads the same grey as every other surface, picked or not', () => {
      mocks.optimisticResponse = 'positive';
      const { pressed, unpressed } = renderPill();

      expect(pressed).toHaveClass('text-grey-04');
      expect(unpressed).toHaveClass('text-grey-04');
    });
  });

  // One definition, so the greys cannot drift apart again. Pinned to the literal because the
  // *value* is the point: `grey-03` reads 2.03:1 on white and fails WCAG 1.4.11's 3:1 for a
  // control, which is what these icons are.
  it('shares one class between the pill and the inline controls', () => {
    expect(VOTE_BUTTON_CLASS).toBe('text-grey-04 hover:text-text');
  });
});
