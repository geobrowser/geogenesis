import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EditableSpaceHeading } from './editable-space-header';

const SPACE_ID = 'space-1';
const SPACE_ROOT = `/space/${SPACE_ID}`;

const mocks = vi.hoisted(() => ({
  pathname: '',
  isEditing: false,
  /** What the sync store answers for the name. `null` until it has the entity. */
  name: 'Physics' as string | null,
}));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.isEditing }));
vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null }) }));
vi.mock('~/core/state/entity-page-store/entity-store', () => ({ useName: () => mocks.name }));
vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({ storage: { entities: { name: { set: vi.fn() } } } }),
}));

vi.mock('../history/use-entity-history', () => ({
  useEntityHistory: () => ({
    allVersions: [],
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    diffSelection: null,
    onVersionClick: vi.fn(),
    clearDiffSelection: vi.fn(),
  }),
}));

// The space-only controls, each behind a portal or the sync engine. Reduced to markers so the row's
// composition is what is asserted.
vi.mock('../history/history-panel', () => ({ HistoryPanel: () => <div data-testid="history" /> }));
vi.mock('../history/history-diff-slide-up', () => ({ HistoryDiffSlideUp: () => null }));
vi.mock('../history/history-empty', () => ({ HistoryEmpty: () => null }));
vi.mock('../history/history-item', () => ({ EntityVersionItem: () => null }));
vi.mock('~/design-system/menu', () => ({
  Menu: () => <div data-testid="space-menu" />,
  MenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('~/partials/space-page/subspaces-dialog', () => ({ SubspacesDialog: () => null }));
vi.mock('~/partials/space-page/space-topic-dialog', () => ({ SpaceTopicDialog: () => null }));
vi.mock('~/partials/space-page/subtopics-dialog', () => ({ SubtopicsDialog: () => null }));
vi.mock('~/partials/versions/create-new-version-in-space', () => ({ CreateNewVersionInSpace: () => null }));

// Forwards its props to a plain anchor, so the accessible name under test is the component's own.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...rest }: React.ComponentProps<'a'>) => <a {...rest}>{children}</a>,
}));

function renderHeading(actionsComponent?: React.ReactNode) {
  return render(<EditableSpaceHeading spaceId={SPACE_ID} entityId="entity-1" actionsComponent={actionsComponent} />);
}

beforeEach(() => {
  mocks.pathname = SPACE_ROOT;
  mocks.isEditing = false;
  mocks.name = 'Physics';
});

afterEach(cleanup);

/**
 * The name row carries two different things: the space's own controls, which belong to the space
 * front page alone, and an `actionsComponent` the route supplies — the profile "Debate" button.
 *
 * Those were briefly gated together, so every space subroute that passed an `actionsComponent`
 * rendered nothing: the slot was drawn only where `isSpacePage` already was.
 */
describe('EditableSpaceHeading actions slot', () => {
  it('renders a supplied actionsComponent on a space subroute', () => {
    mocks.pathname = `${SPACE_ROOT}/community`;
    renderHeading(<button type="button">Debate</button>);

    expect(screen.getByRole('button', { name: 'Debate' })).toBeInTheDocument();
  });

  it('keeps the space-only controls off that subroute', () => {
    mocks.pathname = `${SPACE_ROOT}/community`;
    renderHeading(<button type="button">Debate</button>);

    expect(screen.queryByTestId('history')).toBeNull();
    expect(screen.queryByTestId('space-menu')).toBeNull();
  });

  it('draws both on the space front page', () => {
    renderHeading(<button type="button">Debate</button>);

    expect(screen.getByRole('button', { name: 'Debate' })).toBeInTheDocument();
    expect(screen.getByTestId('history')).toBeInTheDocument();
    expect(screen.getByTestId('space-menu')).toBeInTheDocument();
  });

  it('still draws the space controls when no actionsComponent is supplied', () => {
    renderHeading();

    expect(screen.getByTestId('history')).toBeInTheDocument();
    expect(screen.getByTestId('space-menu')).toBeInTheDocument();
  });

  it('draws no trailing row at all on a subroute with nothing to put in it', () => {
    mocks.pathname = `${SPACE_ROOT}/community`;
    renderHeading();

    expect(screen.queryByTestId('history')).toBeNull();
    expect(screen.queryByTestId('space-menu')).toBeNull();
  });

  it('titles the row whichever route it is on', () => {
    mocks.pathname = `${SPACE_ROOT}/community`;
    renderHeading();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Physics');
  });
});

// Icon-only, so without a label it reaches a screen reader as the bare URL it points at. Matches
// the entity row's create link, which carries the same name.
describe('EditableSpaceHeading create link', () => {
  it('has an accessible name while editing the space front page', () => {
    mocks.isEditing = true;
    renderHeading();

    expect(screen.getByRole('link', { name: 'Create new entity' })).toBeInTheDocument();
  });

  it('is absent in browse mode', () => {
    renderHeading();

    expect(screen.queryByRole('link', { name: 'Create new entity' })).toBeNull();
  });
});

/**
 * The name before the sync store has the entity.
 *
 * `useName` reads the store, which fetches over the network once the page is
 * mounted — so every space rendered its heading as a zero-width space for the
 * length of that request and looked like it had failed to load its own title.
 */
describe('EditableSpaceHeading fallback name', () => {
  it('shows the name the server read until the store has one', () => {
    mocks.name = null;
    render(<EditableSpaceHeading spaceId={SPACE_ID} entityId="entity-1" fallbackName="Preston Mantel" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Preston Mantel');
  });

  it('prefers the store, which is the one that can have been edited', () => {
    render(<EditableSpaceHeading spaceId={SPACE_ID} entityId="entity-1" fallbackName="Stale" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Physics');
  });

  it('keeps the fallback out of the editor, where a keystroke would commit it', () => {
    // The rule `EditableHeading` already draws: a name in the textarea that is
    // not in the store reads as a stored one, and typing a character next to it
    // saves the whole thing.
    mocks.name = null;
    mocks.isEditing = true;
    render(<EditableSpaceHeading spaceId={SPACE_ID} entityId="entity-1" fallbackName="Preston Mantel" />);

    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
