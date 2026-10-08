'use client';

import * as React from 'react';

import cx from 'classnames';

import { normId } from '~/core/utils/norm-id';

import { FacetPill } from './facet-pill';
import { type DebateAnalyticsSurface, debateSurfaceAnalyticsAttributes } from './hub-analytics';
import { type HubFilterOption, HubMultiFilterMenu } from './hub-filter-menu';
import { HubPillButton } from './hub-pill-button';

/** How many lines of pills the row takes before the rest go behind "…", unless picks need more. */
export const FACET_PILL_LINES = 2;

/**
 * How close the picked pills may come to filling the row before it grows a line. At half a line
 * short — picks running past a line and a half of two — there is too little room left beside them
 * for anything that could still be picked, and a row that is mostly filters in force has stopped
 * offering anything.
 */
const PICKED_SLACK_LINES = 0.5;

/**
 * The most options measured for the row. A few lines at the picker's width hold well under this, so
 * measuring the whole facet — which grows with the corpus — would be work spent on pills that can
 * never be drawn. Picked options are measured past it, since they are always drawn.
 */
const MEASURED_OPTION_LIMIT = 40;

/** The row's `gap-2`, which the line-fitting below has to agree with. */
const PILL_GAP_PX = 8;

/** One pill: a space, drawn with its image, or a topic. */
export type FacetPillOption = {
  kind: 'space' | 'topic';
  id: string;
  /** `null` while a space's name is still on its way, which draws as a skeleton. */
  name: string | null;
  /** A space's image. Topics have none. */
  image?: string | null;
  count: number;
};

type Props = {
  analyticsSurface: DebateAnalyticsSurface;
  /**
   * The options to offer, in the order they should be drawn: every space before any topic, and
   * within each, picked first in the order they were picked, then by count — the topic menu's own
   * order (`orderFacetOptions`), so the row refills on each press the way the menu does.
   */
  options: FacetPillOption[];
  /** Every picked space and topic id. */
  pickedIds: string[];
  onToggle: (option: FacetPillOption) => void;
  /** Clears every pick, of both kinds. */
  onClear: () => void;
  /** The counts in hand answer a filter that has since changed. */
  countsPending?: boolean;
  className?: string;
};

/**
 * Lays `widths` out as flex-wrap would across lines of `available` pixels. Returns how many lines
 * that takes, and how far along the last one it ends.
 *
 * An item that does not fit on the current line starts the next, and an item wider than a whole
 * line still takes a line of its own.
 */
function pack(widths: number[], available: number, gap: number) {
  let lines = 1;
  let x = 0;
  for (const width of widths) {
    if (x > 0 && x + gap + width > available) {
      lines += 1;
      x = width;
    } else {
      x += (x > 0 ? gap : 0) + width;
    }
  }
  return { lines, x };
}

/**
 * How many lines the row gets: {@link FACET_PILL_LINES}, plus one for every time the picked pills
 * alone (after the leading All) reach past half a line short of what it has. Two lines, until the
 * picks run past a line and a half; then three, until they run past two and a half; and so on.
 */
export function rowLines({
  leading,
  pickedWidths,
  available,
  gap = PILL_GAP_PX,
  base = FACET_PILL_LINES,
}: {
  leading: number;
  pickedWidths: number[];
  available: number;
  gap?: number;
  base?: number;
}): number {
  // Nothing measured, nothing to grow for.
  if (available <= 0 || pickedWidths.length === 0) return base;
  const { lines, x } = pack([leading, ...pickedWidths], available, gap);
  const extent = lines - 1 + x / available;
  let allowed = base;
  while (extent > allowed - PICKED_SLACK_LINES) allowed += 1;
  return allowed;
}

/**
 * How many of the unpicked items fit on `lines` lines of `available` pixels, after a leading item
 * and with a trailing one reserved whenever anything is left over — dropped here, or never measured
 * (`moreBeyond`).
 *
 * Picked items are always kept wherever they sit, so what gives way is the unpicked ones, from the
 * end. The answer is how many unpicked items, counted from the start, stay.
 */
export function fitPills({
  leading,
  items,
  trailing,
  available,
  lines,
  gap = PILL_GAP_PX,
  moreBeyond = false,
}: {
  leading: number;
  items: { width: number; picked: boolean }[];
  trailing: number;
  available: number;
  lines: number;
  gap?: number;
  /** Options exist past `items` that were never measured, so the trailing control is always drawn. */
  moreBeyond?: boolean;
}): number {
  const unpicked = items.filter(item => !item.picked).length;
  for (let kept = unpicked; kept > 0; kept--) {
    let seen = 0;
    const widths = [leading];
    for (const item of items) {
      if (item.picked) widths.push(item.width);
      else if (seen++ < kept) widths.push(item.width);
    }
    if (kept < unpicked || moreBeyond) widths.push(trailing);
    if (pack(widths, available, gap).lines <= lines) return kept;
  }
  return 0;
}

/**
 * The debate again picker's filters as one row of pills, for a desktop's width (GEO-3223): spaces
 * and topics together, two lines of them, and "…" for the rest.
 *
 * One row because the split was the product's and not the reader's: to someone looking for a claim,
 * "Crypto" and "Regulation" are both things to narrow by, and two rows with two rules asked them to
 * know which was which. So both kinds follow the topic menu's rules — AND, counted as co-occurrence
 * — and each press refills the row with what can still narrow the list. Spaces lead, since there are
 * few of them and they are the coarsest cut; within each kind, picked options come first in the
 * order they were picked, then by count.
 *
 * The facet grows with the corpus, so the row holds what fits on two lines at the width it has,
 * measured, and the full list opens from the "…" at its end. Picked options are always drawn,
 * however many there are: every filter in force stays on screen to be undone. Once they take more
 * than a line and a half, the row grows a line, so there is still room for something to pick.
 */
export function FacetFilterPills({
  analyticsSurface,
  options,
  pickedIds,
  onToggle,
  onClear,
  countsPending = false,
  className,
}: Props) {
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLDivElement | null>(null);

  const picked = React.useMemo(() => new Set(pickedIds.map(normId)), [pickedIds]);
  const isPicked = (id: string) => picked.has(normId(id));

  const candidates = React.useMemo(
    () => options.filter((option, index) => index < MEASURED_OPTION_LIMIT || picked.has(normId(option.id))),
    [options, picked]
  );

  // Every unpicked candidate until measured. A layout effect answers before the first paint, so this
  // is only ever seen where nothing can be measured at all — and there every pill is the honest
  // answer.
  const [keptUnpicked, setKeptUnpicked] = React.useState(Number.POSITIVE_INFINITY);
  // Picked options are drawn whatever the measurement says; unpicked ones as far as they fit.
  const shown = React.useMemo(() => {
    let seen = 0;
    return candidates.filter(option => picked.has(normId(option.id)) || seen++ < keptUnpicked);
  }, [candidates, keptUnpicked, picked]);
  const hiddenCount = options.length - shown.length;

  React.useLayoutEffect(() => {
    const row = rowRef.current;
    const measurer = measureRef.current;
    if (!row || !measurer) return;

    const measure = () => {
      const children = Array.from(measurer.children) as HTMLElement[];
      const widthOf = (element: HTMLElement | undefined) => element?.getBoundingClientRect().width ?? 0;
      const [leading, ...rest] = children;
      const trailing = rest.pop();
      const items = rest.map((element, index) => ({
        width: widthOf(element),
        picked: picked.has(normId(candidates[index]?.id ?? '')),
      }));
      const available = row.clientWidth;
      const lines = rowLines({
        leading: widthOf(leading),
        pickedWidths: items.filter(item => item.picked).map(item => item.width),
        available,
      });
      setKeptUnpicked(
        fitPills({
          leading: widthOf(leading),
          items,
          trailing: widthOf(trailing),
          available,
          lines,
          // Past the measuring limit the "…" is drawn whatever fits, so it needs its room too.
          moreBeyond: options.length > candidates.length,
        })
      );
    };

    measure();
    // Guarded as the repo's other measurement sites are: a runtime without ResizeObserver keeps the
    // answer above for the width it had, rather than throwing inside a layout effect.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(row);
    return () => observer?.disconnect();
    // Re-measured whenever the pills or the picks change. Both are memoized, by this component and
    // by the caller's `options` and `pickedIds`, so that is when a width or a forced pill could.
  }, [candidates, options.length, picked]);

  const byId = React.useMemo(() => new Map(options.map(option => [option.id, option])), [options]);
  const menuOptions = React.useMemo<HubFilterOption<string>[]>(
    () =>
      options.map(option => ({
        value: option.id,
        label: option.name ?? (option.kind === 'space' ? 'Space' : 'Topic'),
        image: option.image ?? null,
        // Only spaces carry a picture; a topic row with an empty image tile would read as a space.
        showImage: option.kind === 'space',
        pending: option.kind === 'space' && option.name === null,
        count: option.count,
      })),
    [options]
  );

  const allPill = (props: React.ComponentProps<typeof HubPillButton> = {}) => (
    <HubPillButton
      variant={pickedIds.length === 0 ? 'primary' : 'secondary'}
      aria-pressed={pickedIds.length === 0}
      onClick={() => {
        if (pickedIds.length > 0) onClear();
      }}
      {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'All filters pill', 'filter')}
      {...props}
    >
      All
    </HubPillButton>
  );

  const pill = (option: FacetPillOption, props: React.ComponentProps<typeof HubPillButton> = {}) => (
    <FacetPill
      key={option.id}
      picked={isPicked(option.id)}
      label={option.name}
      fallbackLabel={option.kind === 'space' ? 'Space' : 'Topic'}
      space={option.kind === 'space' ? { id: option.id, image: option.image ?? null } : undefined}
      count={option.count}
      countsPending={countsPending}
      onClick={() => onToggle(option)}
      {...debateSurfaceAnalyticsAttributes(
        analyticsSurface,
        option.kind === 'space' ? 'Space pill' : 'Topic pill',
        'filter'
      )}
      {...props}
    />
  );

  const moreTrigger = (
    <HubPillButton
      aria-label={`All filters (${options.length})`}
      className="w-9 px-0 tracking-widest text-grey-04"
      {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'More filters', 'filter')}
    >
      ···
    </HubPillButton>
  );

  return (
    <div ref={rowRef} className={cx('relative', className)}>
      <div role="group" aria-label="Filter claims" className="flex flex-wrap items-center gap-2">
        {allPill()}
        {shown.map(option => pill(option))}
        {hiddenCount > 0 ? (
          <HubMultiFilterMenu
            align="start"
            label="All filters"
            trigger={moreTrigger}
            analytics={{ name: 'More filters', surface: analyticsSurface }}
            options={menuOptions}
            values={pickedIds}
            onToggle={id => {
              const option = byId.get(id);
              if (option) onToggle(option);
            }}
            onClear={onClear}
            clearLabel="All"
            countsPending={countsPending}
            showImages
            // The menu draws the field once its list runs past what it can show, which with options
            // already left off the row is the usual case.
            searchPlaceholder="Search spaces and topics"
            searchEmptyLabel="No spaces or topics match"
          />
        ) : null}
      </div>
      {/* Every candidate at its natural width, out of sight, so the row can be fitted to two lines
          before it paints. Inert and hidden from assistive tech: it is a ruler, not a control. */}
      <div
        ref={measureRef}
        aria-hidden
        inert
        className="pointer-events-none invisible absolute top-0 left-0 flex h-0 items-center gap-2 overflow-hidden whitespace-nowrap"
      >
        {allPill({ tabIndex: -1 })}
        {candidates.map(option => pill(option, { tabIndex: -1 }))}
        <HubPillButton tabIndex={-1} className="w-9 px-0">
          ···
        </HubPillButton>
      </div>
    </div>
  );
}
