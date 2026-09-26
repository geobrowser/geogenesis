import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID } from '~/core/claims/ontology';

import { EntityVoteButtons } from './entity-vote-buttons';
import { slideUpPopoverContainersAtom } from '~/atoms';

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
  /** The viewer's own vote, before it has been served back. */
  optimistic: undefined as 'positive' | 'negative' | undefined,
  indexingDelayed: false,
  /** What `useQueryEntity` reports, for the branches that read the entity rather than a prop. */
  entity: null as unknown,
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
    optimisticResponse: mocks.optimistic,
    isResponseIndexingDelayed: mocks.indexingDelayed,
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
vi.mock('~/core/sync/use-store', () => ({ useQueryEntity: () => ({ entity: mocks.entity, isLoading: false }) }));

// Stood in for, so the trigger around it is what the test is looking at rather than the avatar
// stack's own network reads.
vi.mock('~/partials/entity-page/claim-voter-avatars', () => ({
  ClaimResponderAvatars: () => <span data-testid="responder-faces" />,
}));

const jotaiStore = { current: createStore() };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <Provider store={jotaiStore.current}>{children}</Provider>
    </QueryClientProvider>
  );
}

/** A slide-up registering its popover host, the way an open sheet does. */
function openSheetWithHost() {
  const container = document.createElement('div');
  container.setAttribute('data-sheet-popover-host', '');
  document.body.append(container);
  jotaiStore.current.set(slideUpPopoverContainersAtom, [{ token: Symbol('sheet'), container }]);
  return container;
}

function facesTrigger() {
  return screen.getByTestId('responder-faces').closest('button');
}

/**
 * The tally, by the percentage it shows. Not `getByTitle` — both triggers carry the same
 * `View stances`, which is the point of them, so a title lookup is ambiguous by design.
 */
function tallyTrigger() {
  return screen.getByRole('button', { name: '67%' });
}

beforeEach(() => {
  mocks.positive = 2;
  mocks.negative = 1;
  mocks.optimistic = undefined;
  mocks.indexingDelayed = false;
  mocks.entity = null;
  jotaiStore.current = createStore();
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

  /**
   * The list reads the served responders, so on the optimistic count a viewer's first vote made
   * their own face open a popover reporting that nobody has responded — while the tally beside it,
   * gated on the served counts, stayed disabled. One list, one rule about whether there is one.
   */
  it('stay a plain span on the viewer’s own unserved vote, as the tally does', async () => {
    mocks.positive = 0;
    mocks.negative = 0;
    mocks.optimistic = 'positive';
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" />, { wrapper });

    await screen.findByTestId('responder-faces');
    expect(facesTrigger()).toBeNull();
    // The tally shows the viewer's own vote but stays disabled — it carries no `title` either, since
    // there is nothing served to view.
    expect(screen.getByRole('button', { name: '100%' })).toBeDisabled();
  });

  /**
   * The container is read from the store without subscribing, which is deliberate — a subscription
   * would re-render every claim on a list whenever any sheet opened. What made that safe was that
   * opening the popover re-rendered the component doing the reading, so the read was current at the
   * only moment it mattered. Moving the open state into `RespondersPopover` moved that render with
   * it, so the read has to live there too — otherwise a list opened inside a sheet portals to
   * `body`, outside the sheet's `RemoveScroll` shard, and can be seen but not scrolled.
   */
  it('portals into the sheet’s container when opened from inside one', async () => {
    const user = userEvent.setup();
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" />, { wrapper });

    // Settled first, so the sheet registers *after* the last render the buttons do on their own —
    // which is the case that catches a stale capture rather than one a later re-render would mask.
    await waitFor(() => expect(tallyTrigger()).toBeEnabled());
    const container = openSheetWithHost();

    await user.click(tallyTrigger());

    await waitFor(() => expect(container.querySelector('[data-radix-popper-content-wrapper]')).not.toBeNull());
  });

  it('opens the faces’ list into that container too', async () => {
    const user = userEvent.setup();
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" />, { wrapper });

    await waitFor(() => expect(facesTrigger()).not.toBeNull());
    const container = openSheetWithHost();

    await user.click(facesTrigger()!);

    await waitFor(() => expect(container.querySelector('[data-radix-popper-content-wrapper]')).not.toBeNull());
  });

  it('are not drawn at all for a plain entity, which has no responder faces', async () => {
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="curation" />, { wrapper });

    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('responder-faces')).toBeNull();
  });
});

/**
 * The sticky entity header is one fixed-height line beside a name. Three of this control's states
 * are sentences rather than controls, and each is wider than a phone can spare: measured in a
 * browser at 390px, the indexing notice alone pushed the row 94px past its own width and gave the
 * document a horizontal scrollbar.
 *
 * Nothing is lost by dropping them — the page's own copy of this control stays mounted below, merely
 * scrolled out of view, so it keeps the text and the `aria-live` announcement. Verified in the
 * browser too: with the notice forced on, one lives on the page and none in the bar.
 */
describe('compact, for the sticky header', () => {
  const INDEXING = 'Response submitted. Waiting for confirmation.';
  const UNPUBLISHED = 'Publish changes before responding';
  const UNAVAILABLE = 'Response unavailable';

  /**
   * An unpublished edit to the claim's factual flag, shaped so the real
   * `hasUnpublishedClaimResponseKindEdit` answers true. Built rather than stubbed: the predicate is
   * pure over the entity, so driving it is both more faithful and no harder than mocking it — and
   * this branch only runs when the caller passes no `responseKind`, so the entity is what decides.
   */
  function withUnpublishedResponseKindEdit() {
    mocks.entity = {
      relations: [],
      values: [
        {
          spaceId: SPACE,
          property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID },
          isLocal: true,
          hasBeenPublished: false,
        },
      ],
    };
  }

  it('drops the indexing notice but keeps the control', async () => {
    mocks.indexingDelayed = true;
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" compact />, { wrapper });

    await waitFor(() => expect(tallyTrigger()).toBeInTheDocument());
    expect(screen.queryByText(INDEXING)).toBeNull();
  });

  it('still shows the indexing notice everywhere else', async () => {
    mocks.indexingDelayed = true;
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind="stance" />, { wrapper });

    expect(await screen.findByText(INDEXING)).toBeInTheDocument();
  });

  /** These two stand in for the control entirely, so compact draws nothing rather than a sentence. */
  it('draws nothing for the states that are prose instead of a control', () => {
    const { container, rerender } = render(
      <EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind={null} compact />,
      { wrapper }
    );
    expect(container).toBeEmptyDOMElement();

    rerender(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind={null} />);
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
  });

  it('keeps that sentence on every other surface', () => {
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} responseKind={null} />, { wrapper });

    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
  });

  /**
   * The third of the three prose states, and the one my own proof missed: neutering `compact` used
   * to fail two tests, never this branch.
   */
  it('draws nothing for an unpublished response-kind edit', () => {
    withUnpublishedResponseKindEdit();
    const { container } = render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} compact />, { wrapper });

    expect(container).toBeEmptyDOMElement();
  });

  it('still explains the unpublished edit everywhere else', () => {
    withUnpublishedResponseKindEdit();
    render(<EntityVoteButtons entityId="entity-1" spaceId={SPACE} />, { wrapper });

    expect(screen.getByText(UNPUBLISHED)).toBeInTheDocument();
  });
});
