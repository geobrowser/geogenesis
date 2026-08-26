import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CollectionRowActions } from './collection-row-actions';

/**
 * GEO-2643. Removing a row from a collection used to live inside the "..." popover: hover the row,
 * find the control, open it, then click through. This covers the promoted button — that it is
 * there without opening anything, that it drops the row's own relation, and that it stays out of
 * the way when there is nothing to remove.
 */
const ENTITY = '019fedae72b67ab2927adf044d57c566';
const OTHER_ENTITY = '019fedae72b67ab2927adf044d57c567';
const RELATION = '019fedae72b67ab2927adf044d57c600';
const SPACE = '019fedae72b67ab2927adf044d57c500';

type FakeRelation = { id: string; entityId: string; toEntity: { id: string } };

const mocks = vi.hoisted(() => ({
  relations: [] as FakeRelation[],
  deleteRelation: vi.fn(),
  writeText: vi.fn(),
}));

// jsdom ships no clipboard, and the component treats a rejection as "say nothing happened", so the
// stub has to be able to reject as well as resolve.
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: mocks.writeText },
});

vi.mock('~/core/blocks/data/use-data-block', () => ({
  useDataBlock: () => ({ blockEntity: { relations: mocks.relations } }),
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({ storage: { relations: { delete: mocks.deleteRelation } } }),
}));

vi.mock('~/core/hooks/use-space', () => ({ useSpace: () => ({ space: null }) }));

vi.mock('~/design-system/geo-image', () => ({ GeoImage: () => null }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({
    children,
    href,
    entityId: _entityId,
    spaceId: _spaceId,
    ...rest
  }: {
    children: React.ReactNode;
    href?: string;
    entityId?: string;
    spaceId?: string;
  }) => (
    <a href={href ?? '#'} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('~/design-system/select-space-dialog', () => ({
  SelectSpaceAsPopover: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));
vi.mock('~/partials/blocks/table/data-block-open-side-panel-button', () => ({
  DataBlockOpenSidePanelButton: () => null,
}));

function renderActions(overrides: Partial<React.ComponentProps<typeof CollectionRowActions>> = {}) {
  return render(
    <CollectionRowActions
      isEditing
      currentSpaceId={SPACE}
      entityId={ENTITY}
      relationId={RELATION}
      onLinkEntry={() => {}}
      {...overrides}
    />
  );
}

const removeButton = () => screen.queryByRole('button', { name: 'Remove from collection' });
const navigateLink = () => screen.queryByRole('link', { name: 'Navigate to entity' });
const rowMenuTrigger = () => screen.queryByRole('button', { name: 'Show row actions' });

/**
 * Radix mounts the popover's contents only while it is open, which hovering the trigger does, and
 * gives that content `role="dialog"`. Returning it lets a test say an action is *in the menu*
 * rather than merely somewhere on screen — which a link still sitting in the row would satisfy.
 */
function openRowMenu() {
  fireEvent.mouseEnter(rowMenuTrigger()!);
  return within(screen.getByRole('dialog'));
}

beforeEach(() => {
  mocks.relations = [{ id: RELATION, entityId: 'relation-entity', toEntity: { id: ENTITY } }];
  mocks.deleteRelation.mockReset();
});

afterEach(cleanup);

describe('CollectionRowActions remove', () => {
  // The whole point of the ticket: no popover in the way.
  it('offers remove without opening the row menu', () => {
    renderActions();

    expect(removeButton()).toBeInTheDocument();
  });

  it('removes the row on a single click', () => {
    renderActions();

    fireEvent.click(removeButton()!);

    expect(mocks.deleteRelation).toHaveBeenCalledTimes(1);
    expect(mocks.deleteRelation).toHaveBeenCalledWith(mocks.relations[0]);
  });

  // `blockEntity.relations` carries everything hanging off the block, not just its rows. Matching
  // on what a relation points at would delete whichever reached this entity first.
  it('drops the row relation, not another relation reaching the same entity', () => {
    const blockType: FakeRelation = { id: 'types-relation', entityId: 'types-entity', toEntity: { id: ENTITY } };
    const rowRelation: FakeRelation = { id: RELATION, entityId: 'relation-entity', toEntity: { id: ENTITY } };
    mocks.relations = [blockType, rowRelation];

    renderActions();
    fireEvent.click(removeButton()!);

    expect(mocks.deleteRelation).toHaveBeenCalledWith(rowRelation);
  });

  it('does nothing when the row relation is no longer on the block', () => {
    mocks.relations = [{ id: 'someone-elses-relation', entityId: 'x', toEntity: { id: OTHER_ENTITY } }];

    renderActions();
    fireEvent.click(removeButton()!);

    expect(mocks.deleteRelation).not.toHaveBeenCalled();
  });

  // Navigate is a rarely-used action that was taking a permanent slot in the row next to the one
  // people actually came for.
  it('keeps navigate out of the row', () => {
    renderActions();

    expect(navigateLink()).not.toBeInTheDocument();
  });

  it('offers navigate inside the row menu instead', () => {
    renderActions();

    const menu = openRowMenu();

    expect(menu.getByRole('link', { name: 'Navigate to entity' })).toBeInTheDocument();
  });

  // A placeholder row is editable before it has a collection-item relation. Navigate was reachable
  // there before it moved, so the menu has to open without one.
  it('still reaches navigate on a row with no relation yet', () => {
    renderActions({ relationId: undefined });

    const menu = openRowMenu();

    expect(menu.getByRole('link', { name: 'Navigate to entity' })).toBeInTheDocument();
  });

  // Reading a block is not editing one.
  it('leaves remove out when the block is not being edited', () => {
    renderActions({ isEditing: false });

    expect(removeButton()).not.toBeInTheDocument();
  });

  // A row with no collection-item relation has nothing to remove — query blocks derive their rows
  // from the query, which is why the ticket scopes this to collections.
  it('leaves remove out for a row with no relation of its own', () => {
    renderActions({ relationId: undefined });

    expect(removeButton()).not.toBeInTheDocument();
  });
});

/**
 * GEO-2679. The id people actually want off a collection row is the entity the row's relation
 * points at — the thing you paste into a query or a ticket. The relation's own id is the other one,
 * and it stays where it was, one link away.
 *
 * Feedback matters more than usual here: a clipboard write is invisible, so without the tick there
 * is no way to tell a copy from a misfire. Which also means the tick must not appear when the write
 * fails, or it is worse than no feedback at all.
 */
describe('CollectionRowActions copy entity id', () => {
  const copyButton = () => screen.queryByRole('button', { name: 'Copy entity ID' });
  const copiedButton = () => screen.queryByRole('button', { name: 'Entity ID copied' });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.writeText.mockReset();
    mocks.writeText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers copy inside the row menu', () => {
    renderActions();

    expect(openRowMenu().getByRole('button', { name: 'Copy entity ID' })).toBeInTheDocument();
  });

  it('copies the entity the row points at, not the relation', async () => {
    renderActions();
    openRowMenu();

    await act(async () => {
      fireEvent.click(copyButton()!);
    });

    expect(mocks.writeText).toHaveBeenCalledWith(ENTITY);
    expect(mocks.writeText).not.toHaveBeenCalledWith(RELATION);
  });

  it('confirms the copy', async () => {
    renderActions();
    openRowMenu();

    await act(async () => {
      fireEvent.click(copyButton()!);
    });

    expect(copiedButton()).toBeInTheDocument();
  });

  it('goes back to offering a copy afterwards', async () => {
    renderActions();
    openRowMenu();

    await act(async () => {
      fireEvent.click(copyButton()!);
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(copiedButton()).not.toBeInTheDocument();
    expect(copyButton()).toBeInTheDocument();
  });

  // Insecure origins, denied permissions and an unfocused document all reject. Claiming a copy that
  // did not happen is the one outcome worse than the button doing nothing visible.
  it('does not claim success when the clipboard write fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.writeText.mockRejectedValue(new Error('denied'));

    renderActions();
    openRowMenu();

    await act(async () => {
      fireEvent.click(copyButton()!);
    });

    expect(copiedButton()).not.toBeInTheDocument();
    expect(copyButton()).toBeInTheDocument();

    consoleError.mockRestore();
  });

  // Copy is about the row's entity, which a row has whether or not it has a relation of its own.
  it('offers copy on a row with no relation yet', () => {
    renderActions({ relationId: undefined });

    expect(openRowMenu().getByRole('button', { name: 'Copy entity ID' })).toBeInTheDocument();
  });
});
