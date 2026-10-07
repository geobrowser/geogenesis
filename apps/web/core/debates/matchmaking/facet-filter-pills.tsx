'use client';

import * as React from 'react';

import cx from 'classnames';

import { normId } from '~/core/utils/norm-id';

import { Skeleton } from '~/design-system/skeleton';

import { type DebateAnalyticsSurface, debateSurfaceAnalyticsAttributes } from './hub-analytics';
import { SpaceThumb } from './hub-facet-rail';
import { type HubFilterOption, HubMultiFilterMenu } from './hub-filter-menu';
import { HubPillButton } from './hub-pill-button';
import { formatFacetCount } from './topic-facets';

/** How many lines of pills the row may take before the rest go behind "…". */
export const FACET_PILL_LINES = 2;

/**
 * The most options measured for the row. Two lines at the picker's width hold well under this, so
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
   * The options to offer, in the order they should be drawn: picked first in the order they were
   * picked, then by count — the topic menu's own order (`orderFacetOptions`), so the row refills on
   * each press the way the menu does.
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
 * How many of `widths` fit on `lines` lines of `available` pixels, after a leading item and with a
 * trailing one reserved whenever anything is left over.
 *
 * Mirrors flex-wrap: an item that does not fit on the current line starts the next, and an item
 * wider than a whole line still takes a line of its own. `forced` items are always kept, so the
 * answer is never smaller than that.
 */
export function fitPills({
  leading,
  widths,
  trailing,
  available,
  lines,
  gap = PILL_GAP_PX,
  forced = 0,
}: {
  leading: number;
  widths: number[];
  trailing: number;
  available: number;
  lines: number;
  gap?: number;
  forced?: number;
}): number {
  const linesUsed = (items: number[]) => {
    let used = 1;
    let x = 0;
    for (const width of items) {
      if (x > 0 && x + gap + width > available) {
        used += 1;
        x = width;
      } else {
        x += (x > 0 ? gap : 0) + width;
      }
    }
    return used;
  };

  for (let count = widths.length; count > forced; count--) {
    const items = [leading, ...widths.slice(0, count)];
    if (count < widths.length) items.push(trailing);
    if (linesUsed(items) <= lines) return count;
  }
  return Math.min(forced, widths.length);
}

/**
 * The debate again picker's filters as one row of pills, for a desktop's width (GEO-3223): spaces
 * and topics together, two lines of them, and "…" for the rest.
 *
 * One row because the split was the product's and not the reader's: to someone looking for a claim,
 * "Crypto" and "Regulation" are both things to narrow by, and two rows with two rules asked them to
 * know which was which. So both kinds follow the topic menu's rules — AND, counted as co-occurrence
 * — and the row is that menu's top: picked options first in the order they were picked, then
 * whatever the remaining claims carry, by count. Each press re-runs that, so the row refills with
 * what can still narrow the list, and a pressed pill moves to the front with the other picks.
 *
 * The facet grows with the corpus, so the row holds what fits on two lines at the width it has,
 * measured, and the full list opens from the "…" at its end. Picked options are always drawn,
 * however many there are: every filter in force stays on screen to be undone.
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
  const pickedCount = options.filter(option => isPicked(option.id)).length;

  const candidates = React.useMemo(
    () => options.filter((option, index) => index < MEASURED_OPTION_LIMIT || picked.has(normId(option.id))),
    [options, picked]
  );

  // Everything until measured. A layout effect answers before the first paint, so this is only ever
  // seen where nothing can be measured at all — and there every pill is the honest answer.
  const [fitted, setFitted] = React.useState(candidates.length);
  // Picked options are drawn whatever the measurement says.
  const shownCount = Math.max(Math.min(fitted, candidates.length), pickedCount);
  const shown = candidates.slice(0, shownCount);
  const hiddenCount = options.length - shown.length;

  // Re-measured when anything a pill's width depends on changes: which options, their names, their
  // counts, and how many are forced.
  const measureKey = candidates.map(option => `${option.id}:${option.name ?? ''}:${option.count}`).join('|');

  React.useLayoutEffect(() => {
    const row = rowRef.current;
    const measurer = measureRef.current;
    if (!row || !measurer) return;

    const measure = () => {
      const children = Array.from(measurer.children) as HTMLElement[];
      const widthOf = (element: HTMLElement | undefined) => element?.getBoundingClientRect().width ?? 0;
      const [leading, ...rest] = children;
      const trailing = rest.pop();
      setFitted(
        fitPills({
          leading: widthOf(leading),
          widths: rest.map(widthOf),
          trailing: widthOf(trailing),
          available: row.clientWidth,
          lines: FACET_PILL_LINES,
          forced: pickedCount,
        })
      );
    };

    measure();
    // Guarded as the repo's other measurement sites are: a runtime without ResizeObserver keeps the
    // answer above for the width it had, rather than throwing inside a layout effect.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(row);
    return () => observer?.disconnect();
  }, [measureKey, pickedCount]);

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

  const pill = (option: FacetPillOption, props: React.ComponentProps<typeof HubPillButton> = {}) => {
    const on = isPicked(option.id);
    const isSpace = option.kind === 'space';
    return (
      <HubPillButton
        key={option.id}
        variant={on ? 'primary' : 'secondary'}
        aria-pressed={on}
        onClick={() => onToggle(option)}
        className={cx('gap-1.5', isSpace && 'pl-1.5')}
        {...debateSurfaceAnalyticsAttributes(analyticsSurface, isSpace ? 'Space pill' : 'Topic pill', 'filter')}
        {...props}
      >
        {isSpace ? <SpaceThumb spaceId={option.id} image={option.image ?? null} /> : null}
        {option.name === null && isSpace ? (
          <Skeleton className="h-[1em] w-16" aria-label="Loading space name" />
        ) : (
          <span className="max-w-[200px] truncate">{option.name ?? 'Topic'}</span>
        )}
        <span
          className={cx(
            'tabular-nums transition-opacity',
            on ? 'text-white/70' : 'text-grey-04',
            countsPending && 'opacity-50'
          )}
        >
          {formatFacetCount(option.count)}
        </span>
      </HubPillButton>
    );
  };

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
