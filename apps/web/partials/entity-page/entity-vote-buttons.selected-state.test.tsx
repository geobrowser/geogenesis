import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResponseKind } from '~/core/responses/entity-response';

import { EntityVoteButtons } from './entity-vote-buttons';
import { VOTE_BUTTON_CLASS, VOTE_CHEVRON_SELECTED_CLASS } from './vote-button-styles';

/**
 * GEO-2792. Four surfaces had four answers for "this is the one you picked": curation said it with
 * fill alone, stance darkened to `grey-04`, veracity used a hand-written `#2A2B2E`, and the debates
 * pill went blue for up and red for down.
 *
 * They now all say it the way curation always did — grey, with the filled icon carrying the signal.
 * The chevrons keep their darker selected colour, since a chevron has no filled form to switch to.
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
      expect(up).toHaveClass('text-grey-03');
      expect(down).toHaveClass('text-grey-03');
    });

    // The thumbs used to darken to `grey-04` when picked, which is the drift this closes.
    it('does not darken the picked direction', () => {
      mocks.optimisticResponse = 'positive';
      render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind={responseKind} />, { wrapper });

      expect(inlineButtons().up).not.toHaveClass('text-text');
      expect(inlineButtons().up.className).not.toMatch(/(^|\s)text-grey-04(\s|$)/);
    });
  });

  // Deliberately exempt, and unchanged from what shipped: a chevron has no filled form, so colour
  // is the only signal it has.
  describe('veracity chevrons', () => {
    it('keeps its own darker selected colour', () => {
      mocks.optimisticResponse = 'positive';
      render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="veracity" />, { wrapper });

      expect(inlineButtons().up).toHaveClass(VOTE_CHEVRON_SELECTED_CLASS);
    });

    it('leaves the direction the viewer did not pick grey', () => {
      mocks.optimisticResponse = 'positive';
      render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="veracity" />, { wrapper });

      const { down } = inlineButtons();
      expect(down).not.toHaveClass(VOTE_CHEVRON_SELECTED_CLASS);
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

      expect(pressed).toHaveClass('text-grey-03');
      expect(unpressed).toHaveClass('text-grey-03');
    });

    // It rested a shade darker than the inline controls and hovered all the way to black, which is
    // the same divergence one state over.
    it('no longer rests darker or hovers to black', () => {
      mocks.optimisticResponse = 'positive';
      const { pressed } = renderPill();

      expect(pressed.className).not.toMatch(/(^|\s)text-grey-04(\s|$)/);
      expect(pressed).not.toHaveClass('hover:text-text');
    });
  });

  // One definition, so the greys cannot drift apart again.
  it('shares one class between the pill and the inline controls', () => {
    expect(VOTE_BUTTON_CLASS).toBe('text-grey-03 hover:text-grey-04');
  });
});
