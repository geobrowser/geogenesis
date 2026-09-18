'use client';

import * as React from 'react';

import cx from 'classnames';

import {
  type AvailabilityBlock,
  type BlockKind,
  DAY_END_HOUR,
  DAY_INITIAL_HOUR,
  DAY_START_HOUR,
  SLOT_MINUTES,
  addDays,
  clampToDay,
  columnFor,
  formatTime,
  isoDate,
  mergeBlocks,
  mondayOf,
  overlapDepths,
  weekDates,
} from '~/core/availability/blocks';

import { CloseSmall } from '~/design-system/icons/close-small';
import { Text } from '~/design-system/text';

/** Height of one slot row. The whole grid's geometry follows from this. */
const SLOT_PX = 24;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ROWS_PER_HOUR = 60 / SLOT_MINUTES;

const KIND_LABELS: Record<BlockKind, string> = {
  recurring: 'Available weekly',
  dated: 'On this date only',
  exception: 'Unavailable',
};

/** What a block says about itself once it is on the grid. */
const KIND_BADGES: Record<BlockKind, string> = {
  recurring: 'weekly',
  dated: 'this date',
  exception: 'unavailable',
};

/**
 * One colour per kind, carried by both the block on the grid and the dot on its mode button — which
 * is what lets the buttons double as the legend rather than needing one beside them.
 */
const KIND_COLORS: Record<BlockKind, string> = {
  recurring: '#DEC2FF',
  dated: '#9DE2FF',
  exception: '#FFA998',
};

const minutesToTop = (minutes: number) => ((minutes - DAY_START_HOUR * 60) / SLOT_MINUTES) * SLOT_PX;

type Drag =
  | { type: 'create'; weekday: number; anchor: number; head: number }
  | { type: 'move'; id: string; weekday: number; grab: number; start: number; end: number }
  | { type: 'resize'; id: string; weekday: number; edge: 'start' | 'end' };

/**
 * A week grid a person drags their availability onto (GEO-2936).
 *
 * Drag on a column to create a block, drag a block to move it, drag its edges to resize. Every
 * time snaps to {@link SLOT_MINUTES}, so a block can only ever describe slots that are offerable.
 * The mode selector decides what a new block means — see the block kinds in `core/availability`.
 *
 * Uncontrolled: it owns the blocks and reports them, because the caller has no use for a half-
 * finished drag and would re-render the grid under the pointer if it held them.
 */
export function AvailabilityCalendar({
  initialBlocks = [],
  onChange,
  actions,
  className,
}: {
  initialBlocks?: AvailabilityBlock[];
  onChange?: (blocks: AvailabilityBlock[]) => void;
  /** Rendered in the footer row beside Clear all — the modal puts Cancel and Save here. */
  actions?: React.ReactNode;
  className?: string;
}) {
  const [blocks, setBlocks] = React.useState(initialBlocks);
  const [mode, setMode] = React.useState<BlockKind>('recurring');
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  /** A touch being held, until it either becomes a drag or is let go of. */
  const holdRef = React.useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const nextId = React.useRef(1);

  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  React.useEffect(() => {
    onChangeRef.current?.(blocks);
  }, [blocks]);

  // Null until mounted. The week is anchored to the viewer's clock, which the server does not have
  // — rendering it during SSR would hydrate as a mismatch.
  const [today, setToday] = React.useState<Date | null>(null);
  React.useEffect(() => setToday(new Date()), []);

  const dates = React.useMemo(
    () => (today ? weekDates(addDays(mondayOf(today), weekOffset * 7)) : []),
    [today, weekOffset]
  );
  const isoDates = React.useMemo(() => dates.map(isoDate), [dates]);

  // Opens at DAY_INITIAL_HOUR with the hours above it scrolled off rather than absent, so an early
  // riser or another time zone only has to scroll rather than be told this grid is not for them.
  //
  // The heading row is part of the scrolled content and sticks over the top of it, so it covers
  // exactly the distance it occupies: scrolling by the hours above leaves DAY_INITIAL_HOUR on the
  // first line under the headings, with no allowance to make for them.
  //
  // Waits for the columns: on mount the week is still null (it is read from the viewer's clock in
  // an effect of its own), and in a dialog still being laid out there is nothing to scroll yet.
  const scrolledToOpeningHour = React.useRef(false);
  React.useEffect(() => {
    if (scrolledToOpeningHour.current || dates.length === 0 || !scrollRef.current) return;
    scrolledToOpeningHour.current = true;
    scrollRef.current.scrollTop = ((DAY_INITIAL_HOUR - DAY_START_HOUR) * 60 * SLOT_PX) / SLOT_MINUTES;
  }, [dates.length]);

  /**
   * The start of the slot the pointer is inside.
   *
   * Floored, not rounded. Rounding asks which boundary is nearest, so the bottom few pixels of the
   * 8:30 cell are nearer to 9:00 and a press there created a 9:00 block — the cell you pressed and
   * the cell you got were different ones. Flooring asks which cell the pointer is in, which is the
   * question the viewer thinks they are answering.
   */
  const slotStartAt = React.useCallback((clientY: number) => {
    // Measured from a day column, not the grid: the grid's own top is the sticky heading row, and
    // a column's is midnight, which is what the times are reckoned from.
    const column = gridRef.current?.querySelector<HTMLElement>('[data-weekday]');
    if (!column) return DAY_START_HOUR * 60;
    const offsetY = clientY - column.getBoundingClientRect().top;
    const minutes = DAY_START_HOUR * 60 + Math.floor(offsetY / SLOT_PX) * SLOT_MINUTES;
    // The last slot *starts* one slot before the end of the day.
    return Math.min(clampToDay(minutes), DAY_END_HOUR * 60 - SLOT_MINUTES);
  }, []);

  /** Take the gesture and decide what it is doing: creating, moving, or resizing. */
  const beginDrag = (target: HTMLElement, clientY: number, pointerId: number) => {
    const column = target.closest<HTMLElement>('[data-weekday]');
    if (!column) return;
    const weekday = Number(column.dataset.weekday);
    const time = slotStartAt(clientY);
    gridRef.current?.setPointerCapture(pointerId);

    const blockElement = target.closest<HTMLElement>('[data-block-id]');
    if (!blockElement) {
      setDrag({ type: 'create', weekday, anchor: time, head: time });
      return;
    }

    const id = blockElement.dataset.blockId as string;
    const block = blocks.find(candidate => candidate.id === id);
    if (!block) return;
    const edge = target.dataset.edge as 'start' | 'end' | undefined;
    setDrag(
      edge
        ? { type: 'resize', id, weekday, edge }
        : { type: 'move', id, weekday, grab: time, start: block.start, end: block.end }
    );
  };

  const cancelHold = () => {
    if (!holdRef.current) return;
    clearTimeout(holdRef.current.timer);
    holdRef.current = null;
  };

  React.useEffect(() => cancelHold, []);

  const onPointerDown = (event: React.PointerEvent) => {
    const target = event.target as HTMLElement;
    // The delete button handles itself. Starting a drag here would capture the pointer, and a
    // captured pointer delivers the click to the grid instead of the button — so the × did nothing.
    if (target.closest('[data-delete]')) return;
    if (!target.closest('[data-weekday]')) return;

    if (event.pointerType === 'mouse') {
      event.preventDefault();
      beginDrag(target, event.clientY, event.pointerId);
      return;
    }

    // Touch has to share this surface with scrolling, and a grid that created a block on every tap
    // would fill itself in while someone was only looking around. So a touch does nothing until it
    // has been held still: until then the browser keeps the gesture and scrolls with it, and a tap
    // or a swipe leaves the schedule untouched.
    const { clientX, clientY, pointerId } = event;
    cancelHold();
    holdRef.current = {
      x: clientX,
      y: clientY,
      timer: setTimeout(() => {
        holdRef.current = null;
        beginDrag(target, clientY, pointerId);
      }, TOUCH_HOLD_MS),
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const hold = holdRef.current;
    if (hold && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > TOUCH_HOLD_SLOP_PX) cancelHold();
    if (!drag) return;
    const time = slotStartAt(event.clientY);

    if (drag.type === 'create') {
      setDrag({ ...drag, head: time });
      return;
    }

    setBlocks(current =>
      current.map(block => {
        if (block.id !== drag.id) return block;
        if (drag.type === 'move') {
          const duration = drag.end - drag.start;
          // Clamp the start, then the end, so a block dragged past the last hour stops whole
          // rather than being squashed against the bottom.
          const start = Math.min(clampToDay(drag.start + (time - drag.grab)), DAY_END_HOUR * 60 - duration);
          return { ...block, start, end: start + duration };
        }
        // The bottom edge takes the *end* of the slot under the pointer, the top edge its start —
        // so both edges land on the cell the viewer is pointing at rather than past it.
        return drag.edge === 'start'
          ? { ...block, start: Math.min(time, block.end - SLOT_MINUTES) }
          : { ...block, end: Math.max(time + SLOT_MINUTES, block.start + SLOT_MINUTES) };
      })
    );
  };

  const onPointerUp = () => {
    // Let go before the hold elapsed: a tap, which means nothing here.
    cancelHold();
    if (!drag) return;
    if (drag.type === 'create') {
      const start = Math.min(drag.anchor, drag.head);
      // Both ends name the slot they are in, and the block covers them inclusively — so a press
      // with no movement is exactly the cell pressed, and a drag over three cells is those three.
      const end = Math.max(drag.anchor, drag.head) + SLOT_MINUTES;
      const id = `block-${nextId.current++}`;
      const created: AvailabilityBlock =
        mode === 'recurring'
          ? { id, kind: 'recurring', weekday: drag.weekday, start, end }
          : { id, kind: mode, date: isoDates[drag.weekday], start, end };
      setBlocks(current => mergeBlocks([...current, created]));
    } else {
      // Merge after a move or resize too, so dragging one block onto another leaves one window.
      setBlocks(current => mergeBlocks(current));
    }
    setDrag(null);
  };

  // Mirrors `drag` for the native listener below, which is registered once and would otherwise
  // close over the state as it was at mount.
  const dragRef = React.useRef(drag);
  dragRef.current = drag;

  // Once a drag is under way, the finger is drawing rather than scrolling. React's onTouchMove is
  // passive, so preventDefault there is ignored; this has to be a listener of our own.
  React.useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const suppressPan = (event: TouchEvent) => {
      if (dragRef.current) event.preventDefault();
    };
    grid.addEventListener('touchmove', suppressPan, { passive: false });
    return () => grid.removeEventListener('touchmove', suppressPan);
  }, []);

  const removeBlock = (id: string) => setBlocks(current => current.filter(block => block.id !== id));

  const weekLabel = React.useMemo(() => {
    if (dates.length === 0 || !today) return '';
    const month = (date: Date) => date.toLocaleDateString(undefined, { month: 'short' });
    const [first] = dates;
    const last = dates[6];
    // The year is only worth the space once the week has left the current one — paging from
    // December into January is the moment it stops being obvious, and the only moment it earns
    // being said. A week that straddles new year names it, since its last day is the one outside.
    const year = last.getFullYear() === today.getFullYear() ? '' : `, ${last.getFullYear()}`;
    return `${month(first)} ${first.getDate()} – ${month(last)} ${last.getDate()}${year}`;
  }, [dates, today]);

  /** Blocks per column, each with the indent that keeps an overlapping one visible. */
  const columns = React.useMemo(
    () =>
      isoDates.map((_, weekday) => {
        const inColumn = blocks.filter(block => columnFor(block, isoDates) === weekday);
        const depths = overlapDepths(inColumn);
        return inColumn.map(block => ({ block, depth: depths.get(block.id) ?? 0 }));
      }),
    [blocks, isoDates]
  );

  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index);
  const todayIso = today ? isoDate(today) : null;

  return (
    // `min-h-0` so this can be given a bounded height by its caller: without it a flex child
    // refuses to shrink below its content, and the grid pushes the footer off the bottom.
    <div className={cx('flex min-h-0 flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-3">
        {/* These double as the legend: each carries the colour its blocks are drawn in, so the
            colours are named exactly once and cannot drift from the grid. */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="New block mode">
          {(Object.keys(KIND_LABELS) as BlockKind[]).map(kind => (
            <button
              key={kind}
              type="button"
              aria-pressed={mode === kind}
              onClick={() => setMode(kind)}
              className={cx(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-metadata transition-colors',
                // The selected mode is the one a drag would create, so it takes the darker outline
                // and text rather than a fill — the fills belong to the blocks.
                mode === kind ? 'border-text text-text' : 'border-grey-02 text-grey-04 hover:text-text'
              )}
            >
              <i className="block size-2.5 rounded-full" style={{ backgroundColor: KIND_COLORS[kind] }} />
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4">
          {/* Only once there is somewhere to come back from — on the current week it would be a
              button that does nothing. */}
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="text-metadata text-grey-04 transition-colors hover:text-text"
            >
              Today
            </button>
          )}
          <NavButton label="Previous week" onClick={() => setWeekOffset(offset => offset - 1)}>
            ←
          </NavButton>
          <Text as="span" variant="metadata" color="grey-04" className="tabular-nums">
            {weekLabel}
          </Text>
          <NavButton label="Next week" onClick={() => setWeekOffset(offset => offset + 1)}>
            →
          </NavButton>
        </div>
      </div>

      {/* One scroller for both axes, with the day headings stuck to its top and the hour column to
          its left. Two nested scrollers cannot do this: `position: sticky` resolves against the
          nearest scrollport on each axis, so a gutter inside a vertical scroller has nothing to
          hold onto while an outer one carries it sideways — which is how the hours ended up
          drifting off the edge. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-grey-02 bg-white">
        <div
          ref={scrollRef}
          // `overscroll-none` rather than `contain`: on iOS a scroller that has run out of room still
          // rubber-bands, and the sticky hour column and headings slide away from the border with
          // it. `-webkit-overflow-scrolling: auto` drops the momentum layer that carries that
          // bounce. On mobile the columns are a fixed width, so the week reaches past the screen.
          className="max-h-[32rem] min-h-0 flex-1 overflow-auto overscroll-none [--availability-column:calc((100vw-5rem)/3.5)] [-webkit-overflow-scrolling:auto] md:max-h-none"
        >
          <div
            ref={gridRef}
            // `touch-pan-*` throughout: touch only takes the gesture once a press has been held
            // (see onPointerDown), and until then the browser keeps it and the grid scrolls both
            // ways. The pan is suppressed for the rest of a drag by the non-passive listener
            // above rather than by switching touch-action here — changing it mid-gesture cancels
            // the pointer, which ended the drag the moment the hold fired.
            className="relative grid touch-pan-x touch-pan-y grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] select-none md:grid-cols-[3.5rem_repeat(7,var(--availability-column))]"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* The corner holds both edges at once, so it must outrank each of them. */}
            <div className="sticky top-0 left-0 z-40 border-b border-grey-02 bg-white" />
            {dates.map((date, weekday) => {
              const isToday = isoDates[weekday] === todayIso;
              return (
                <div
                  key={isoDates[weekday]}
                  className="sticky top-0 z-30 flex justify-center border-b border-grey-02 bg-white px-2 py-2"
                >
                  {/* Today takes a box around the whole cell — a coloured number alone was easy to
                    miss in a row of seven. */}
                  <div
                    data-day-cell
                    className={cx(
                      'flex flex-1 flex-col items-center gap-0.5 rounded-[8px] py-1 text-[#151515]',
                      // Today is the filled cell; every other day is the same ink at 70%, so the
                      // difference is the fill rather than a second colour.
                      isToday ? 'bg-grey-01' : 'opacity-70'
                    )}
                  >
                    <span className="text-footnote">{WEEKDAY_LABELS[weekday]}</span>
                    <span className="text-metadataMedium tabular-nums">{date.getDate()}</span>
                  </div>
                </div>
              );
            })}

            {/* Pinned to the left edge: swiping across the week must not carry the hours away
                with it, or there is nothing left to read the blocks against. */}
            <div className="sticky left-0 z-20 bg-white">
              {hours.map(hour => (
                <div
                  key={hour}
                  className="relative border-b border-divider pr-2 text-right"
                  style={{ height: SLOT_PX * ROWS_PER_HOUR }}
                >
                  <Text
                    as="span"
                    variant="footnoteMedium"
                    color="grey-04"
                    className="relative -top-1.5"
                    data-hour-label
                  >
                    {formatTime(hour * 60)}
                  </Text>
                </div>
              ))}
            </div>

            {dates.map((_, weekday) => (
              <div key={isoDates[weekday]} data-weekday={weekday} className="relative border-l border-divider">
                {/* Hour rules only. The half-hour dashes drew a line under every slot, which is
                      a lot of ruling for a grid whose blocks already say where they start. */}
                {hours.map(hour => (
                  <div key={hour} className="border-b border-grey-02/60" style={{ height: SLOT_PX * ROWS_PER_HOUR }} />
                ))}

                {columns[weekday]?.map(({ block, depth }) => (
                  <Block key={block.id} block={block} depth={depth} onDelete={() => removeBlock(block.id)} />
                ))}

                {drag?.type === 'create' && drag.weekday === weekday && <Ghost drag={drag} mode={mode} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* One row under the grid: clearing on the left, the caller's own actions (Save, Cancel) on
          the right — the destructive control kept at the far end from them. Clear reaches blocks in
          weeks that are not on screen, which is otherwise the only thing that can leave a schedule
          the viewer cannot see. Disabled rather than hidden while there is nothing to clear, so it
          does not appear and disappear as the week changes. */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setBlocks([])}
          disabled={blocks.length === 0}
          className="rounded-full border border-grey-02 px-3 py-1 text-metadata text-grey-04 transition-colors hover:text-text disabled:pointer-events-none disabled:opacity-40"
        >
          Clear all
        </button>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** How long a touch must be held before it starts drawing, and how far it may stray while held. */
const TOUCH_HOLD_MS = 350;
const TOUCH_HOLD_SLOP_PX = 10;

/** Above any block stack — see the ghost's own note. */
const GHOST_Z_INDEX = 100;

/** How far each overlapping block steps right, so the one beneath it stays readable. */
const OVERLAP_INDENT_PX = 10;

function Block({ block, depth, onDelete }: { block: AvailabilityBlock; depth: number; onDelete: () => void }) {
  const duration = block.end - block.start;
  return (
    <div
      data-block-id={block.id}
      style={{
        top: minutesToTop(block.start),
        height: (duration / SLOT_MINUTES) * SLOT_PX - 2,
        left: 4 + depth * OVERLAP_INDENT_PX,
        backgroundColor: KIND_COLORS[block.kind],
        // Later blocks sit above the ones they are stepped off, so their own edges stay grabbable.
        zIndex: depth + 1,
      }}
      className="group absolute right-1 cursor-grab overflow-hidden rounded-sm px-1.5 py-0.5 text-text"
    >
      {/* The × rides on the label's own line rather than being positioned against the corner: it
          then sits at exactly the label's inset, with no box of its own to pad it away from the
          top edge. */}
      <div className="flex items-start justify-between gap-1">
        <span className="min-w-0 flex-1 truncate text-footnoteMedium tabular-nums">
          {formatTime(block.start)} – {formatTime(block.end)}
        </span>
        <button
          type="button"
          data-delete
          aria-label={`Delete ${formatTime(block.start)} to ${formatTime(block.end)} block`}
          onClick={onDelete}
          className="shrink-0 text-[#151515] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <CloseSmall />
        </button>
      </div>
      {/* Only tall enough blocks can say what kind they are; the colour and its mode button carry
          it for the rest. */}
      {duration > 60 && <span className="block truncate text-footnote uppercase">{KIND_BADGES[block.kind]}</span>}

      <div data-edge="start" className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize" />
      <div data-edge="end" className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" />
    </div>
  );
}

/** The block being dragged into existence, before it becomes one. */
function Ghost({ drag, mode }: { drag: Extract<Drag, { type: 'create' }>; mode: BlockKind }) {
  const start = Math.min(drag.anchor, drag.head);
  const end = Math.max(drag.anchor, drag.head) + SLOT_MINUTES;
  return (
    <div
      aria-hidden
      data-ghost
      style={{
        top: minutesToTop(start),
        height: ((end - start) / SLOT_MINUTES) * SLOT_PX - 2,
        // Half-strength in the colour it is about to become, so the drag says which kind it will
        // be without yet looking like a block that exists.
        backgroundColor: `${KIND_COLORS[mode]}80`,
        // Above every block, however deep the stack: a drag drawn *underneath* the block it
        // overlaps is invisible until it is let go of, which is when it is too late to adjust.
        zIndex: GHOST_Z_INDEX,
      }}
      className="pointer-events-none absolute inset-x-1 rounded-sm px-1.5 py-0.5"
    >
      <span className="block truncate text-footnoteMedium text-text tabular-nums">
        {formatTime(start)} – {formatTime(end)}
      </span>
    </div>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-8 place-items-center text-grey-04 transition-colors hover:text-text"
    >
      {children}
    </button>
  );
}
