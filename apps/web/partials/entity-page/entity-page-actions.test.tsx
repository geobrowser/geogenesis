import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityPageActions } from './entity-page-actions';

const mocks = vi.hoisted(() => ({
  isEditing: false,
  /** Every `(entityId, spaceId)` pair the component asked a name for. */
  nameCalls: [] as unknown[][],
  /** Args `useEntityHistory` was called with. */
  historyArgs: null as Record<string, unknown> | null,
  contextMenu: null as Record<string, unknown> | null,
  voteButtons: null as Record<string, unknown> | null,
}));

vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.isEditing }));

vi.mock('~/core/state/entity-page-store/entity-store', () => ({
  useName: (...args: unknown[]) => {
    mocks.nameCalls.push(args);
    return 'Ada Lovelace';
  },
}));

vi.mock('../history/use-entity-history', () => ({
  useEntityHistory: (args: Record<string, unknown>) => {
    mocks.historyArgs = args;
    return {
      allVersions: [],
      isFetching: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      diffSelection: null,
      onVersionClick: vi.fn(),
      clearDiffSelection: vi.fn(),
    };
  },
}));

// Radix menus, the diff overlay and the vote batch each want a portal or the sync engine. This file
// is about which controls the row draws and on what entity, not about what they open into.
vi.mock('../history/history-panel', () => ({
  HistoryPanel: ({ children }: { children: React.ReactNode }) => <div data-testid="history">{children}</div>,
}));
vi.mock('../history/history-diff-slide-up', () => ({ HistoryDiffSlideUp: () => null }));
vi.mock('../history/history-empty', () => ({ HistoryEmpty: () => null }));
vi.mock('../history/history-item', () => ({ EntityVersionItem: () => null }));

vi.mock('./entity-page-context-menu', () => ({
  EntityPageContextMenu: (props: Record<string, unknown>) => {
    mocks.contextMenu = props;
    return <div data-testid="context-menu" />;
  },
}));

vi.mock('./entity-vote-buttons', () => ({
  EntityVoteButtons: (props: Record<string, unknown>) => {
    mocks.voteButtons = props;
    return <div data-testid="vote-buttons" />;
  },
}));

// Forwards its props to a plain anchor, so the accessible name under test is the one the component
// actually passed rather than one the stub invented.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...rest }: React.ComponentProps<'a'>) => <a {...rest}>{children}</a>,
}));

beforeEach(() => {
  mocks.isEditing = false;
  mocks.nameCalls = [];
  mocks.historyArgs = null;
  mocks.contextMenu = null;
  mocks.voteButtons = null;
});

afterEach(cleanup);

describe('EntityPageActions', () => {
  it('draws the context menu and history on every surface', () => {
    render(<EntityPageActions entityId="entity-1" spaceId="space-1" />);

    expect(screen.getByTestId('context-menu')).toBeInTheDocument();
    expect(screen.getByTestId('history')).toBeInTheDocument();
  });

  it('votes only where the caller asked for it', () => {
    const { rerender } = render(<EntityPageActions entityId="entity-1" spaceId="space-1" />);
    expect(screen.queryByTestId('vote-buttons')).toBeNull();

    rerender(<EntityPageActions entityId="entity-1" spaceId="space-1" isVoteable />);
    expect(screen.getByTestId('vote-buttons')).toBeInTheDocument();
    expect(mocks.voteButtons).toMatchObject({ entityId: 'entity-1', spaceId: 'space-1' });
  });

  /**
   * `useName`'s `spaceId` is optional and falls back to "any space holding a name for this entity".
   * An entity routinely carries a different name in each space it lives in, so dropping the scope
   * puts whichever one the store happened to return into the context menu's rename field.
   */
  it('reads the name with both the entity and the space', () => {
    render(<EntityPageActions entityId="entity-1" spaceId="space-1" />);

    expect(mocks.nameCalls).toContainEqual(['entity-1', 'space-1']);
    expect(mocks.contextMenu).toMatchObject({
      entityId: 'entity-1',
      spaceId: 'space-1',
      entityName: 'Ada Lovelace',
    });
  });

  it('asks for history on the same entity it names', () => {
    render(<EntityPageActions entityId="entity-1" spaceId="space-1" />);

    expect(mocks.historyArgs).toMatchObject({ entityId: 'entity-1', spaceId: 'space-1' });
  });

  // Icon-only, so without a label it reaches a screen reader as the bare URL it points at.
  // (It is hidden on phones, not shown only there — `sm` is max-width 639px in this repo.)
  it('gives the create link an accessible name while editing', () => {
    mocks.isEditing = true;
    render(<EntityPageActions entityId="entity-1" spaceId="space-1" />);

    expect(screen.getByRole('link', { name: 'Create new entity' })).toBeInTheDocument();
  });

  it('leaves the create link out in browse mode', () => {
    render(<EntityPageActions entityId="entity-1" spaceId="space-1" />);

    expect(screen.queryByRole('link', { name: 'Create new entity' })).toBeNull();
  });
});
