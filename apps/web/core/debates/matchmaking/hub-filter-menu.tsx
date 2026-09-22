'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';
import { CheckboxVisual } from '~/design-system/checkbox';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Search } from '~/design-system/icons/search';
import { TickSmall } from '~/design-system/icons/tick-small';
import { inputStyles } from '~/design-system/input';
import { Menu, type MenuAlign } from '~/design-system/menu';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { formatFacetCount } from './topic-facets';
import { useDelayedFlag } from './use-delayed-flag';

export type HubFilterOption<T extends string> = {
  value: T;
  label: string;
  image?: string | null;
  showImage?: boolean;
  /** This option's label hasn't arrived yet — draw it as a skeleton and don't let it be picked. */
  pending?: boolean;
  /** How many claims this option would leave, given every other filter currently applied. */
  count?: number;
};

type Props<T extends string> = {
  label: string;
  options: HubFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  showImages?: boolean;
  /** As {@link HubFilterOption.pending}, for the name in the trigger pill. */
  labelPending?: boolean;
  /**
   * What the skeleton in the trigger announces while `labelPending` holds. Defaults to the space
   * menu's wording, which is what this component was built for; the Claims source menu waits on
   * something else entirely and would otherwise tell a screen reader it was loading a space name.
   */
  labelPendingAnnouncement?: string;
};

/**
 * State-driven sibling of `GovernanceFilterMenu` — the hub filters live in local state instead of
 * the URL, so options are buttons rather than links.
 *
 * An option whose name is still loading draws as a skeleton rather than a placeholder word. A
 * column of identical "Space" rows reads as a list of real, indistinguishable choices — it invites
 * a pick that means nothing, where a skeleton says plainly that the name is on its way.
 */
export function HubFilterMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  showImages,
  labelPending,
  labelPendingAnnouncement = 'Loading space name',
}: Props<T>) {
  const [open, setOpen] = React.useState(false);

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      className="max-w-[280px]"
      // Space names come from the knowledge graph and can be long enough to burst the pill.
      trigger={
        <SmallButton icon={<ChevronDownSmall />} className="max-w-[160px]">
          {labelPending ? (
            // Sized to the pill's line box so the trigger doesn't resize when the name lands.
            <Skeleton className="h-[1em] w-16" aria-label={labelPendingAnnouncement} />
          ) : (
            <span className="truncate">{label}</span>
          )}
        </SmallButton>
      }
    >
      <>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            // Picking a space nobody can name yet filters the list to something the viewer can't
            // read back off the trigger. The wait is short; the dead end isn't worth it.
            disabled={option.pending}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 text-left hover:bg-bg disabled:cursor-default disabled:hover:bg-white"
          >
            {showImages && option.showImage !== false ? (
              option.pending ? (
                <Skeleton className="h-5 w-5 shrink-0 rounded-md" />
              ) : option.image ? (
                <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
                  <ThumbGeoImage value={option.image} alt="" />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-grey-01 text-[10px] font-medium text-grey-04">
                  {(option.label.trim().slice(0, 1).toUpperCase() || '?').replace(/[^A-Z0-9?]/g, '?')}
                </span>
              )
            ) : null}
            {option.pending ? (
              // Varied widths so a run of them reads as a list of names rather than a striped block.
              <Skeleton
                className="h-[1em] flex-1"
                style={{ maxWidth: pendingLabelWidth(option.value) }}
                aria-label="Loading space name"
              />
            ) : (
              <Text variant="button" className="truncate hover:text-text!">
                {option.label}
              </Text>
            )}
            {option.value === value ? (
              <span className="ml-auto shrink-0">
                <TickSmall />
              </span>
            ) : null}
          </button>
        ))}
      </>
    </Menu>
  );
}

type MultiProps<T extends string> = {
  /** Shown in the trigger pill: the one selected name, a count of them, or the "any" wording. */
  label: string;
  options: HubFilterOption<T>[];
  values: T[];
  onToggle: (value: T) => void;
  /** Clears every selection — the row that reads "Any space" / "Any topic". */
  onClear: () => void;
  clearLabel: string;
  showImages?: boolean;
  /** Overrides the shared menu's viewport-based horizontal placement. */
  align?: MenuAlign;
  labelPending?: boolean;
  /**
   * The counts in hand answer a filter the viewer has already moved on from.
   *
   * Not a request to hide them on this render: the menu waits out {@link COUNT_SKELETON_DELAY_MS}
   * first, so a spell shorter than that shows the previous numbers rather than a placeholder that
   * would only flash. Callers should read this as "these are stale", not "these are hidden".
   */
  countsPending?: boolean;
  /**
   * Turns on the in-menu search field, using this as its placeholder and accessible name.
   *
   * Opt-in rather than always on, because it only earns its place where the menu can get long
   * enough to scroll past what the viewer can hold in their head. Topics are that menu — a space's
   * facet is however many subjects its claims have been tagged with, and it grows with the corpus.
   * The space menu is the viewer's own spaces, which is a list they already know.
   */
  searchPlaceholder?: string;
  /** What the menu says when the query matches nothing. */
  searchEmptyLabel?: string;
};

/**
 * How long the counts may be pending before they turn into skeletons. GEO-2721 made the facets
 * query fast — a materialized set rather than a subquery re-run per candidate row, 65ms rather
 * than 17s — so an answer now normally arrives inside this window and the numbers just change.
 * The skeleton stays for the slow answer it was written for, instead of flashing on every tick.
 */
const COUNT_SKELETON_DELAY_MS = 250;

/**
 * The multi-select twin of {@link HubFilterMenu}: checkboxes, and the menu stays open so several
 * can be picked in one visit.
 *
 * Counts describe what that option would leave, given the rest of the filter. The two dimensions
 * differ, because the filters do: spaces are OR, so the space menu is narrowed by the topics and
 * never by itself, and ticking a space leaves its own numbers alone. Topics are AND, so a topic's
 * count answers "how many of the claims I'm already looking at also carry this", and ticking one
 * does narrow the rest of its menu to what co-occurs with it (GEO-2696).
 */
export function HubMultiFilterMenu<T extends string>({
  label,
  options,
  values,
  onToggle,
  onClear,
  clearLabel,
  showImages,
  align,
  labelPending,
  countsPending,
  searchPlaceholder,
  searchEmptyLabel = 'No matches',
}: MultiProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);
  const showCountSkeletons = useDelayedFlag(countsPending ?? false, COUNT_SKELETON_DELAY_MS);
  const selected = new Set<string>(values);

  // Nothing to search through is worse than no field at all: it offers work that cannot pay off,
  // and it is the state a menu waiting on its first facet sits in.
  const searchable = searchPlaceholder !== undefined && options.length > 0;
  const trimmedQuery = searchable ? query.trim() : '';
  const searching = trimmedQuery.length > 0;

  const visibleOptions = React.useMemo(
    () => (trimmedQuery === '' ? options : options.filter(option => matchesQuery(option, trimmedQuery))),
    [options, trimmedQuery]
  );

  // The query belongs to a visit, not to the filter. Left behind, reopening the menu would show a
  // list already narrowed by something the viewer typed a while ago and has no reason to expect —
  // and the selection they *did* make is on the trigger, where they can see it.
  const onOpenChange = React.useCallback((next: boolean) => {
    if (!next) setQuery('');
    setOpen(next);
  }, []);

  React.useEffect(() => {
    if (!open || !searchable) return;
    // Only where a keyboard is already in front of the viewer. On a touch device this would throw
    // the software keyboard up over the very list it is meant to help pick from, before anyone has
    // said they want to type.
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(pointer: fine)').matches) return;
    // Radix focuses the popover content itself on open, so take focus on the next frame rather than
    // racing it. `preventScroll` because the panel this sits in scrolls independently.
    const frame = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, searchable]);

  return (
    <Menu
      open={open}
      onOpenChange={onOpenChange}
      asChild
      align={align}
      className="max-w-[280px]"
      trigger={
        <SmallButton icon={<ChevronDownSmall />} className="max-w-[160px]">
          {labelPending ? (
            <Skeleton className="h-[1em] w-16" aria-label="Loading space name" />
          ) : (
            <span className="truncate">{label}</span>
          )}
        </SmallButton>
      }
    >
      <>
        {searchable ? (
          // Sticky, because the list it filters is exactly the list long enough to scroll — losing
          // the field at the top of it would mean scrolling back to change a query by one letter.
          <div className="sticky top-0 z-10 border-b border-grey-02 bg-white p-2">
            <div className="relative w-full">
              <div className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-grey-04">
                <Search />
              </div>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={event => setQuery(event.currentTarget.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className={inputStyles({ withSearchIcon: true })}
              />
            </div>
          </div>
        ) : null}
        {searching ? null : (
          <button
            type="button"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 text-left hover:bg-bg"
          >
            <Text variant="button" className="truncate hover:text-text!">
              {clearLabel}
            </Text>
            {values.length === 0 ? (
              <span className="ml-auto shrink-0">
                <TickSmall />
              </span>
            ) : null}
          </button>
        )}
        {searching && visibleOptions.length === 0 ? (
          <div className="px-3 py-2.5">
            <Text variant="footnote" className="text-grey-04!">
              {searchEmptyLabel}
            </Text>
          </div>
        ) : null}
        {visibleOptions.map(option => (
          <button
            key={option.value}
            type="button"
            disabled={option.pending}
            // The checkbox is a graphic, and `aria-hidden` at that, so without this the row reads as
            // an ordinary button and nothing says whether it is picked.
            aria-pressed={selected.has(option.value)}
            // No `setOpen(false)`: the point of multi-select is picking more than one, and closing
            // on the first tick would make the second a whole new trip through the trigger.
            onClick={() => onToggle(option.value)}
            className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 text-left hover:bg-bg disabled:cursor-default disabled:hover:bg-white"
          >
            <span className="shrink-0">
              <CheckboxVisual checked={selected.has(option.value)} />
            </span>
            {showImages && option.showImage !== false ? (
              option.pending ? (
                <Skeleton className="h-5 w-5 shrink-0 rounded-md" />
              ) : option.image ? (
                <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
                  <ThumbGeoImage value={option.image} alt="" />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-grey-01 text-[10px] font-medium text-grey-04">
                  {(option.label.trim().slice(0, 1).toUpperCase() || '?').replace(/[^A-Z0-9?]/g, '?')}
                </span>
              )
            ) : null}
            {option.pending ? (
              <Skeleton
                className="h-[1em] flex-1"
                style={{ maxWidth: pendingLabelWidth(option.value) }}
                aria-label="Loading space name"
              />
            ) : (
              <Text variant="button" className="truncate hover:text-text!">
                {option.label}
              </Text>
            )}
            {option.count === undefined ? null : showCountSkeletons ? (
              // Held as a skeleton rather than removed: the number is coming back, and taking the
              // column away and putting it back makes every row twitch on each tick.
              <span className="ml-auto shrink-0">
                <Skeleton className="h-[1em] w-5" aria-label="Loading count" />
              </span>
            ) : (
              <Text variant="footnote" className="ml-auto shrink-0 text-grey-04!">
                {formatFacetCount(option.count)}
              </Text>
            )}
          </button>
        ))}
      </>
    </Menu>
  );
}

/**
 * Whether an option survives the in-menu search.
 *
 * A plain case-insensitive substring, not a prefix: topic names are ordinary noun phrases and the
 * word the viewer remembers is as often the second one ("climate policy" typed as "policy").
 *
 * An option whose label hasn't arrived is dropped while a query is live rather than kept. Its label
 * is a skeleton, so there is nothing to match it on — and keeping it would put an unreadable row in
 * a list the viewer is looking at precisely because they know what they want.
 */
function matchesQuery<T extends string>(option: HubFilterOption<T>, query: string): boolean {
  if (option.pending) return false;
  return option.label.toLowerCase().includes(query.toLowerCase());
}

/**
 * A stable pseudo-random width per option, so the skeletons look like names of different lengths
 * and stay put across re-renders rather than jittering while the fetch runs.
 */
function pendingLabelWidth(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return `${60 + (hash % 5) * 15}px`;
}

/**
 * What a filter's trigger pill says, given how many options are ticked.
 *
 * One selection reads as its own name — the useful case, and the one the viewer is most often in —
 * while several collapse to a count, because two names rarely fit and a truncated pair reads as one
 * bad name. Lives beside the menu rather than with any one caller: it is the rule for that
 * component's `label`, and the debates panel and Explore both have to say it the same way.
 */
export function pickerLabel(count: number, empty: string, single: () => string, many: (count: number) => string) {
  if (count === 0) return empty;
  return count === 1 ? single() : many(count);
}
