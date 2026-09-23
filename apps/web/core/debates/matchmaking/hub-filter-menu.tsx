'use client';

import * as React from 'react';

import { useAutofocus } from '~/core/hooks/use-autofocus';
import { useMediaQuery } from '~/core/hooks/use-media-query';

import { SmallButton } from '~/design-system/button';
import { CheckboxVisual } from '~/design-system/checkbox';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { TickSmall } from '~/design-system/icons/tick-small';
import { Input } from '~/design-system/input';
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
  /**
   * What the trigger is called, where its label does not say on its own.
   *
   * The space and source menus name what they filter — "Any space", "Featured" — so the label is
   * the whole answer. A sort menu's is just the order ("Best"), which tells a screen reader nothing
   * about what it does.
   */
  triggerAriaLabel?: string;
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
  triggerAriaLabel,
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
        <SmallButton icon={<ChevronDownSmall />} className="max-w-[160px]" aria-label={triggerAriaLabel}>
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
   * Allows the in-menu search field, using this as its placeholder and accessible name.
   *
   * Allows rather than shows: the field appears only once the options actually run off the end of
   * the menu, which the layout effect below measures. A search box over a list you can already see
   * whole is a control that asks the viewer to type in order to reach something their eye had
   * already found.
   *
   * Opt-in per menu on top of that, because only some of them can ever get there. Topics are the
   * one that does — a space's facet is however many subjects its claims have been tagged with, and
   * it grows with the corpus. The space menu is the viewer's own spaces, a list they already know.
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
 * How much taller than its scroll viewport the list must be before the search field is worth
 * showing. A pixel of slack, so a sub-pixel rounding difference on a list that fits exactly is not
 * read as a list that runs off the end.
 */
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * How long the field waits before taking focus on open.
 *
 * It buys the frame, not the milliseconds: Radix focuses the popover content itself when it mounts,
 * and {@link useAutofocus} waits this out and then an animation frame, which puts this after it
 * rather than racing it.
 */
const SEARCH_FOCUS_DELAY_MS = 1;

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
  const [overflows, setOverflows] = React.useState(false);
  const [viewportNode, setViewportNode] = React.useState<HTMLDivElement | null>(null);
  const [listNode, setListNode] = React.useState<HTMLDivElement | null>(null);
  const showCountSkeletons = useDelayedFlag(countsPending ?? false, COUNT_SKELETON_DELAY_MS);
  const selected = new Set<string>(values);

  const searchEnabled = searchPlaceholder !== undefined;
  const showSearch = searchEnabled && overflows;
  const trimmedQuery = showSearch ? query.trim() : '';
  const searching = trimmedQuery.length > 0;

  const visibleOptions = React.useMemo(
    () => (trimmedQuery === '' ? options : options.filter(option => matchesQuery(option, trimmedQuery))),
    [options, trimmedQuery]
  );

  /**
   * Whether the viewer has started working inside the menu, which is the only thing that separates a
   * field arriving as part of opening from one arriving on top of them.
   *
   * The latch below can turn true at any point in a visit, not just at the opening: unticking a
   * topic widens the co-occurrence facet, and the menu deliberately stays open for it, so the list
   * can cross the end of the viewport under a cursor that is mid-pick. Focus must not jump to a
   * field that appears then — it would take the keyboard out of the row they are in and leave the
   * next arrow key scrolling a text box.
   *
   * Three events rather than one, because they answer two different questions and neither is
   * enough alone. Pointer and key say the viewer is *engaged* with the list — scrolling it, holding
   * a row, arrowing through it — none of which ends in an activation. Click says a row was
   * *activated*, and it is the only one of the three that a screen reader, voice control or a bare
   * `HTMLElement.click()` is guaranteed to emit: those drive the activation directly and no pointer
   * or key event ever reaches the row. Listening for the modality rather than the act would have
   * left exactly those viewers with the focus yanked out from under them.
   */
  const touchedRef = React.useRef(false);
  const markTouched = React.useCallback(() => {
    touchedRef.current = true;
  }, []);

  // The query belongs to a visit, not to the filter. Left behind, reopening the menu would show a
  // list already narrowed by something the viewer typed a while ago and has no reason to expect —
  // and the selection they *did* make is on the trigger, where they can see it.
  //
  // The overflow verdict goes with it: the menu is asking a question about a list that no longer
  // exists, and the next opening measures the one that does.
  const onOpenChange = React.useCallback((next: boolean) => {
    if (!next) {
      setQuery('');
      setOverflows(false);
    } else {
      touchedRef.current = false;
    }
    setOpen(next);
  }, []);

  /**
   * Whether a keyboard is already in front of the viewer, which is the only case where the field
   * taking focus is a help rather than an ambush. On a touch device it would throw the software
   * keyboard up over the very list it is meant to help pick from, before anyone said they wanted
   * to type.
   *
   * Through the shared hook rather than an inline `matchMedia` read, for the answer it gives when
   * it cannot tell: a runtime without `matchMedia` reports `false` here, and so does the server.
   * The two ways of being wrong are not symmetric — guessing "desktop" covers the list with a
   * keyboard nobody asked for, while guessing "touch" costs a tap on a field already on screen —
   * so the unknown case belongs on the side that only costs a tap.
   */
  const hasFinePointer = useMediaQuery('(pointer: fine)');

  const shouldSkipFocus = React.useCallback(() => {
    if (touchedRef.current) return true;
    return !hasFinePointer;
  }, [hasFinePointer]);

  const searchRef = useAutofocus<HTMLInputElement>(open && showSearch, SEARCH_FOCUS_DELAY_MS, {
    shouldSkipFocus,
    // The popover is already placed, and the panel behind it scrolls on its own.
    preventScroll: true,
  });

  /**
   * Whether the options run off the end of the menu, which is the whole question of whether a
   * search field is worth its space.
   *
   * Measured rather than counted. The height to beat belongs to the shared menu — a max-height
   * against the viewport — so the row count that clears it is different on a laptop and on a phone
   * held in one hand, and the phone is where a long list is hardest to scan. A guess would be wrong
   * there, in the direction of withholding the field.
   *
   * Layout effect, so the verdict is in before the first paint and the field does not appear a beat
   * after the menu it belongs to.
   *
   * Latched on rather than tracked both ways. Narrowing the list is the point of the field, and a
   * query that trims it back to something that fits would otherwise take the field away mid-word —
   * leaving the viewer's own query on screen with nothing to edit it in. It can only ever be turned
   * off by closing the menu, above. That also makes this stable rather than circular: the field
   * costs height, so showing it can only push the list further past the end, never back inside.
   */
  React.useLayoutEffect(() => {
    if (!searchEnabled || !viewportNode || !listNode) return;

    const measure = () => {
      if (viewportNode.scrollHeight > viewportNode.clientHeight + OVERFLOW_TOLERANCE_PX) setOverflows(true);
    };

    measure();
    // Both ends of the comparison move on their own: the viewport as the popover settles into the
    // space it has, the list as options arrive and as names land under the skeletons. Guarded the
    // way the repo's other measurement sites are — without it a runtime that has no ResizeObserver
    // throws inside a layout effect and blanks the panel, where the measurement above has already
    // answered for the list as it stands and only later growth goes unnoticed.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewportNode);
    observer?.observe(listNode);
    return () => observer?.disconnect();
  }, [searchEnabled, viewportNode, listNode]);

  return (
    <Menu
      open={open}
      onOpenChange={onOpenChange}
      asChild
      align={align}
      className="max-w-[280px]"
      viewportRef={setViewportNode}
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
        {showSearch ? (
          // Same chrome as the properties menu's search (`table-block-properties-menu.tsx`), which
          // is also the chrome of the "Search claims" field directly above this row in the panel.
          //
          // Sticky rather than pinned above the scroll well, because `Menu` owns that well and puts
          // every child inside it. It has to stay put either way: the list this filters is by
          // definition the one long enough to scroll the field off the top, and losing it there
          // would mean scrolling back to change a query by one letter.
          <div className="sticky top-0 z-10 border-b border-grey-02 bg-white p-2">
            <Input
              withSearchIcon
              inputRef={searchRef}
              value={query}
              onChange={event => setQuery(event.currentTarget.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              // As the properties menu does: what happens in the field is the field's business, and
              // the surfaces this menu opens over listen for both.
              //
              // Two things ride on this that are worth naming, because neither is visible from here.
              // Escape still closes the popover: Radix's dismissable layer listens natively on the
              // document, in the capture phase, where a React handler cannot reach it. And Radix's
              // focus scope loops Tab through a React handler on the content, which this does stop —
              // so Shift+Tab out of the field lands on the trigger rather than wrapping to the last
              // row. From the first element in the scope that is the better of the two anyway.
              onClick={event => event.stopPropagation()}
              onKeyDown={event => event.stopPropagation()}
            />
          </div>
        ) : null}
        {/* One node whose height is exactly "how much list there is", which is what makes the
            options' own growth observable — the viewport stops changing size once it reaches its
            max-height, and `scrollHeight` alone reports no event when it moves. */}
        <div
          ref={setListNode}
          onPointerDownCapture={markTouched}
          onKeyDownCapture={markTouched}
          // Capture like its siblings, not because the ordering within the event matters — the
          // toggle's re-render cannot land until the event is over either way — but so a row that
          // ever stops propagation cannot quietly take the guard with it.
          onClickCapture={markTouched}
        >
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
          {/* The empty state, and the announcement of it, in one node.

              Typing narrows the rows while focus stays in the field, so a run of them vanishing is
              silent: a viewer who cannot see the list is told nothing and has to go looking to find
              out it is empty. `role="status"` says it out loud without taking focus off what they
              are typing.

              Mounted for as long as the field is, and empty until there is something to say, rather
              than appearing with its message already inside it — a live region inserted at the same
              moment as its text is the case screen readers are documented to miss, and an
              announcement nobody hears would leave this where it started. Empty it has no padding
              and no text, so it costs no height while it waits.

              One node rather than a visible message beside a screen-reader-only twin, which would
              put the same sentence in the accessibility tree twice: once on the way past, once out
              loud. */}
          <div
            role="status"
            aria-live="polite"
            className={searching && visibleOptions.length === 0 ? 'px-3 py-2.5' : undefined}
          >
            {searching && visibleOptions.length === 0 ? (
              <Text variant="footnote" className="text-grey-04!">
                {searchEmptyLabel}
              </Text>
            ) : null}
          </div>
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
        </div>
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
