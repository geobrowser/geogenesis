'use client';

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import * as React from 'react';

import cx from 'classnames';

import { TIER_LINE_A_LABEL, TIER_LINE_B_LABEL } from '~/core/blocks/ranking/ranking-grades';

import { HEADER_DISABLED } from '../ranking-my-ranking-dnd';

const LINE_A = '__tier-line:A';
const LINE_B = '__tier-line:B';

/** The list with the two lines placed: `aCount` entries, the A line, `bCount` more, the B line, the rest. */
export function tierLinesOrder(entityIds: readonly string[], aCount: number, bCount: number): string[] {
  const a = clamp(aCount, 0, entityIds.length);
  const b = clamp(bCount, 0, entityIds.length - a);
  return [...entityIds.slice(0, a), LINE_A, ...entityIds.slice(a, a + b), LINE_B, ...entityIds.slice(a + b)];
}

/**
 * Where the lines are after a drag: A covers the entries above the higher line, B those between the
 * two. A line dragged past the other swaps with it, so A always stays on top.
 */
export function countsAfterLineDrag(order: readonly string[]): { aCount: number; bCount: number } {
  let entries = 0;
  const at: Record<string, number> = {};
  for (const id of order) {
    if (id === LINE_A || id === LINE_B) at[id] = entries;
    else entries += 1;
  }
  const first = Math.min(at[LINE_A] ?? 0, at[LINE_B] ?? 0);
  const second = Math.max(at[LINE_A] ?? 0, at[LINE_B] ?? 0);
  return { aCount: first, bCount: second - first };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const POINTER_ACTIVATION = { distance: 4 };
const TOUCH_ACTIVATION = { delay: 150, tolerance: 6 };

/** A debate here never moves but stays a drop target, so a line can be dropped next to it. */
function FixedEntry({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, transform, transition } = useSortable({ id, disabled: HEADER_DISABLED });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}>
      {children}
    </div>
  );
}

function TierLine({ id, label, count }: { id: string; label: string; count: string }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx('relative z-10 flex items-center gap-2.5 py-1.5', isDragging && 'opacity-90')}
      data-testid={`tier-line-${id === LINE_A ? 'a' : 'b'}`}
    >
      <span className="h-0.5 flex-1 rounded-full bg-text" aria-hidden />
      <button
        type="button"
        className="flex h-8 shrink-0 cursor-grab touch-none items-center rounded-full bg-text px-3 text-metadata font-medium whitespace-nowrap text-white active:cursor-grabbing md:h-11"
        aria-label={`${label}, ${count}. Drag to move.`}
        {...attributes}
        {...listeners}
      >
        {label}
      </button>
      <span className="shrink-0 text-metadata whitespace-nowrap text-grey-04">{count}</span>
      <span className="h-0.5 flex-1 rounded-full bg-text" aria-hidden />
    </div>
  );
}

/**
 * The one-time "Grade your ranking" step (GEO-3729 mockup): the ranker's list in its own order, with
 * an "A ends here" and a "B ends here" line to drag. Only the lines move; the debates never do.
 */
export function TierLinesList({
  entityIds,
  aCount,
  bCount,
  onChange,
  renderItem,
  className,
}: {
  entityIds: string[];
  aCount: number;
  bCount: number;
  onChange: (counts: { aCount: number; bCount: number }) => void;
  renderItem: (entityId: string, index: number) => React.ReactNode;
  className?: string;
}) {
  const order = tierLinesOrder(entityIds, aCount, bCount);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: POINTER_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const a = clamp(aCount, 0, entityIds.length);
  const b = clamp(bCount, 0, entityIds.length - a);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(countsAfterLineDrag(arrayMove(order, from, to)));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {order.map(id =>
            id === LINE_A ? (
              <TierLine key={id} id={id} label={TIER_LINE_A_LABEL} count={`A · ${a}`} />
            ) : id === LINE_B ? (
              <TierLine key={id} id={id} label={TIER_LINE_B_LABEL} count={`B · ${b}`} />
            ) : (
              <FixedEntry key={id} id={id}>
                {renderItem(id, entityIds.indexOf(id))}
              </FixedEntry>
            )
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
