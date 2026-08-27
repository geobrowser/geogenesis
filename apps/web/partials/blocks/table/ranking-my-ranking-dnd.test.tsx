import { render, screen } from '@testing-library/react';

import type React from 'react';

import { describe, expect, it, vi } from 'vitest';

import { RankingMyRankingDndList } from './ranking-my-ranking-dnd';

const mocks = vi.hoisted(() => ({
  pointerDown: vi.fn(),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MouseSensor: class MouseSensor {},
  TouchSensor: class TouchSensor {},
  closestCenter: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  arrayMove: vi.fn(),
  useSortable: () => ({
    attributes: { role: 'button', tabIndex: 0 },
    listeners: { onPointerDown: mocks.pointerDown },
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => undefined } },
}));

describe('RankingMyRankingDndList', () => {
  it('keeps trailing vote controls outside the sortable drag activator', () => {
    render(
      <RankingMyRankingDndList
        entityIds={['entity-1', 'entity-2']}
        onReorder={vi.fn()}
        renderItem={entityId => <div>{entityId}</div>}
        renderTrailing={entityId => <button aria-label={`Vote on ${entityId}`} />}
      />
    );

    const activator = screen.getByText('entity-1').closest('[data-ranking-drag-activator]');
    const voteButton = screen.getByRole('button', { name: 'Vote on entity-1' });

    expect(activator).not.toBeNull();
    expect(activator?.contains(voteButton)).toBe(false);
    expect(voteButton.parentElement?.closest('[data-ranking-drag-activator]')).toBeNull();
  });
});
