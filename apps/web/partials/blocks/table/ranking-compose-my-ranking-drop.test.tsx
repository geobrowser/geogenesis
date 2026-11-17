import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RankingComposeMyRanking } from './ranking-compose-my-ranking';
import { RANKING_DROP_ROW_ATTRIBUTE, RANKING_ENTITY_DRAG_TYPE } from './ranking-entity-drag';

vi.mock('./ranking-entry-row', () => ({
  RankingEntryRow: ({ entry }: { entry: { name: string } }) => <span>{entry.name}</span>,
}));

afterEach(cleanup);

const entries = new Map(
  ['a', 'b', 'c'].map(id => [id, { entityId: id, name: `Debate ${id}`, description: null, image: null }])
);

function renderMyRanking(onDropEntity?: (id: string, index: number) => void) {
  return render(
    <RankingComposeMyRanking
      isMobile={false}
      spaceId="s"
      displayEntityIds={['a', 'b', 'c']}
      entriesById={entries}
      searchResultsById={new Map()}
      rowsByEntityId={new Map()}
      canPublish={false}
      isSaving={false}
      hidePublishButton={false}
      activeSwipeRowKey={null}
      onActiveSwipeRowKeyChange={vi.fn()}
      onPublish={vi.fn()}
      onReorder={vi.fn()}
      onRemove={vi.fn()}
      onView={vi.fn()}
      pendingEntityIds={new Set()}
      title={onDropEntity ? 'Your ranking' : undefined}
      onDropEntity={onDropEntity}
    />
  );
}

/** Rows 40px tall from the top, so their middles sit at 20, 60 and 100. */
function layOutRows() {
  document.querySelectorAll<HTMLElement>(`[${RANKING_DROP_ROW_ATTRIBUTE}]`).forEach((row, index) => {
    row.getBoundingClientRect = () => ({ top: index * 40, height: 40 }) as DOMRect;
  });
}

const dragData = (id: string) => ({ types: [RANKING_ENTITY_DRAG_TYPE], getData: () => id, dropEffect: '' });

/** jsdom has no DragEvent, so the pointer position is set on the event by hand. */
function drag(kind: 'dragOver' | 'drop', target: HTMLElement, id: string, clientY: number) {
  const event = createEvent[kind](target, { dataTransfer: dragData(id) });
  Object.defineProperty(event, 'clientY', { value: clientY });
  fireEvent(target, event);
}

describe('dragging a debate into Your ranking', () => {
  it('inserts it where it is dropped', () => {
    const onDropEntity = vi.fn();
    renderMyRanking(onDropEntity);
    layOutRows();
    const target = screen.getByTestId('ranking-drop-target');

    drag('dragOver', target, 'x', 50);
    drag('drop', target, 'x', 50);
    expect(onDropEntity).toHaveBeenCalledWith('x', 1);

    drag('drop', target, 'y', 500);
    expect(onDropEntity).toHaveBeenLastCalledWith('y', 3);
  });

  it('takes no drops on other ranking blocks', () => {
    renderMyRanking();
    expect(screen.queryByTestId('ranking-drop-target')).toBeNull();
    expect(screen.getByText('My ranking')).toBeTruthy();
  });
});
