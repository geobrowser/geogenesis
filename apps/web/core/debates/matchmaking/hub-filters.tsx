'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';

import { BottomSheet } from '~/design-system/bottom-sheet';
import { CheckboxVisual } from '~/design-system/checkbox';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Search } from '~/design-system/icons/search';
import { inputStyles } from '~/design-system/input';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import type { DebateClaimPositionSummary } from '../api';
import type { TaggedClaimOrder } from '../tagged-claims';
import { type ClaimOrderFacts, compareByNewest, compareByRanking } from './claim-order-facts';
import { SegmentedControl } from './debate-calendar-controls';
import { FacetFilterPills, type FacetPillOption } from './facet-filter-pills';
import { type DebateAnalyticsSurface, debateSurfaceAnalyticsAttributes } from './hub-analytics';
import { HUB_EYEBROW_CLASS_NAME } from './hub-eyebrow';
import { HubPillButton, hubPillClassName } from './hub-pill-button';
import type { HubEmptyAction } from './hub-states';
import { opposingPositions } from './opposing-positions';
import { narrowingOptions, orderFacetOptions, toggleId } from './topic-facets';

/**
 * The side panel's one search field and one Filters button (GEO-3463).
 *
 * Before this, People, Live, Explore and My positions each drew a row of menus and switches above the
 * list — about 520px of furniture at an 800px window before the first person or claim. Everything
 * that narrows a list now sits behind Filters, and what is on shows as removable chips under the
 * search, so the list starts right under the tabs and a filter is still one press from undone.
 *
 * Sort sits in the same popover but is not a filter: it never counts towards the badge, never shows
 * as a chip and Clear all leaves it alone (decision 34).
 *
 * On a phone the same controls open as a bottom sheet with a "Show N" button, because a popover
 * hanging off a button inside a sheet has nowhere to go.
 */

export type HubSortOption<T extends string> = {
  value: T;
  label: string;
  /** What the chip under search says when this choice is on, where the label alone is unclear. */
  chipLabel?: string;
};

/** A yes/no filter: "Online now", "Include people who are offline", "Someone online to debate". */
export type HubFilterToggle = {
  id: string;
  label: string;
  /** What the chip under search says while it is on; usually shorter than the label. */
  chipLabel: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

/** A one-of-several filter whose default is not a selection: Explore's Show. */
export type HubFilterChoice<T extends string> = {
  heading: string;
  options: HubSortOption<T>[];
  value: T;
  defaultValue: T;
  onChange: (next: T) => void;
};

export type HubFacetFilter = {
  heading: string;
  options: FacetPillOption[];
  /**
   * Picked spaces and picked topics, apart. A pick can drop out of `options` (its count went to
   * nothing under a later pick, or its facet failed to load), and its chip must still know which
   * kind it is: removing a topic's chip as though it were a space would add it to the spaces.
   */
  pickedSpaceIds: string[];
  pickedTopicIds: string[];
  onToggle: (option: FacetPillOption) => void;
  onClear: () => void;
  countsPending?: boolean;
};

/**
 * What a panel tab hands its list so the list can draw the Filters bar (GEO-3463): the tab's Sort,
 * its switches, and how its list should be ordered. The list adds what it alone knows — search,
 * spaces and topics with their counts, and how many rows are left.
 */
export type PanelListFilters = {
  // Loosely typed so one shape serves every tab's own sort and choice unions.
  sort: { options: HubSortOption<string>[]; value: string; onChange: (next: string) => void };
  choice?: HubFilterChoice<string>;
  toggles?: HubFilterToggle[];
  /** The tab's own filters, which Clear all resets alongside the list's spaces and topics. */
  onClearExtras?: () => void;
  /** Explore's server-side order. */
  graphOrder?: TaggedClaimOrder;
  /** For lists ordered by geo-chat, which cannot be asked for another order. */
  clientSort?: ClaimRowSort;
  /**
   * What to say when the tab's own narrowing (`keepClaim`) left nothing, and the way out — usually
   * turning that switch back off. Without it the list would blame a filter the viewer never set.
   */
  emptyPredicate?: { message: string; action?: HubEmptyAction };
  /**
   * The way out of an empty list the tab's own Show or switches narrowed, in place of "Explore
   * claims": on the panel's Explore that is the tab already open, so the button did nothing.
   */
  emptyAction?: HubEmptyAction;
};

export type ClaimRowSort = 'best' | 'newest' | 'people';

export type SortableClaimRow = {
  claim: { claim_entity_id: string };
  positions: DebateClaimPositionSummary[];
  viewer_response?: { position: boolean } | null;
};

/**
 * People who could take the other side right now, the "Most people" sort's measure. A viewer holding
 * no side could take either, so every side counts.
 */
export function opposingPeopleCount(row: SortableClaimRow) {
  const viewerSide = row.viewer_response?.position;
  return (viewerSide === undefined ? row.positions : opposingPositions(row.positions, viewerSide)).reduce(
    (sum, position) => sum + position.available_now_count,
    0
  );
}

/**
 * A claim list in hand, in the order a Sort asks for. Stable: rows that tie keep the order they
 * arrived in, which is the server's ranking for every list here.
 */
export function sortClaimRows<T extends SortableClaimRow>(
  rows: T[],
  sort: ClaimRowSort,
  facts: ReadonlyMap<string, ClaimOrderFacts>
): T[] {
  const factsFor = (row: T) => facts.get(normId(row.claim.claim_entity_id));
  const compare =
    sort === 'people'
      ? (left: T, right: T) => opposingPeopleCount(right) - opposingPeopleCount(left)
      : sort === 'newest'
        ? (left: T, right: T) => compareByNewest(factsFor(left), factsFor(right))
        : (left: T, right: T) => compareByRanking(factsFor(left), factsFor(right));
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => compare(left.row, right.row) || left.index - right.index)
    .map(({ row }) => row);
}

type Props<S extends string, C extends string> = {
  analyticsSurface: DebateAnalyticsSurface;
  search: string;
  onSearchChange: (next: string) => void;
  searchPlaceholder: string;
  sort: { options: HubSortOption<S>[]; value: S; onChange: (next: S) => void };
  choice?: HubFilterChoice<C>;
  toggles?: HubFilterToggle[];
  facets?: HubFacetFilter | null;
  /** How many rows the list shows under the current filters, for "Show N". `null` while unknown. */
  resultCount: number | null;
  /** Everything but Sort back to its default. */
  onClearAll: () => void;
};

/** One chip under search per active filter, each removable on its own. */
type ActiveChip = { key: string; label: string; onRemove: () => void };

export function HubFiltersBar<S extends string, C extends string>({
  analyticsSurface,
  search,
  onSearchChange,
  searchPlaceholder,
  sort,
  choice,
  toggles = [],
  facets,
  resultCount,
  onClearAll,
}: Props<S, C>) {
  const isMobile = useIsMobileLayout();
  const [open, setOpen] = React.useState(false);

  const chips = React.useMemo<ActiveChip[]>(() => {
    const active: ActiveChip[] = [];
    if (choice && choice.value !== choice.defaultValue) {
      const option = choice.options.find(entry => entry.value === choice.value);
      active.push({
        key: `choice:${choice.value}`,
        label: option?.chipLabel ?? option?.label ?? choice.value,
        onRemove: () => choice.onChange(choice.defaultValue),
      });
    }
    for (const toggle of toggles) {
      if (toggle.checked) {
        active.push({ key: `toggle:${toggle.id}`, label: toggle.chipLabel, onRemove: () => toggle.onChange(false) });
      }
    }
    if (facets) {
      const byId = new Map(facets.options.map(option => [`${option.kind}:${normId(option.id)}`, option]));
      const picked = (kind: FacetPillOption['kind'], ids: string[]) =>
        ids.map(id => {
          const option = byId.get(`${kind}:${normId(id)}`) ?? { kind, id, name: null, count: 0 };
          active.push({
            key: `${kind}:${id}`,
            label: option.name ?? (kind === 'topic' ? 'Topic' : 'Space'),
            onRemove: () => facets.onToggle(option),
          });
        });
      picked('space', facets.pickedSpaceIds);
      picked('topic', facets.pickedTopicIds);
    }
    return active;
  }, [choice, facets, toggles]);

  const activeCount = chips.length;

  const trigger = (
    <button
      type="button"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={activeCount > 0 ? `Filters, ${activeCount} on` : 'Filters'}
      {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'Filters', 'filter')}
      className={hubPillClassName(activeCount > 0 ? 'primary' : 'secondary', 'h-8 shrink-0 gap-1.5 md:h-9')}
    >
      Filters
      {activeCount > 0 ? (
        <span
          aria-hidden
          className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-white px-1 text-browseSection leading-none text-text"
        >
          {activeCount}
        </span>
      ) : null}
    </button>
  );

  const body = (
    <FiltersBody
      analyticsSurface={analyticsSurface}
      sort={sort}
      choice={choice}
      toggles={toggles}
      facets={facets}
      resultCount={resultCount}
      hasSelection={activeCount > 0}
      onClearAll={onClearAll}
      onDone={() => setOpen(false)}
      phone={isMobile}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SearchField value={search} onChange={onSearchChange} placeholder={searchPlaceholder} />
        {isMobile ? (
          <FiltersSheet
            open={open}
            onOpenChange={setOpen}
            trigger={trigger}
            onClearAll={activeCount > 0 ? onClearAll : undefined}
            analyticsSurface={analyticsSurface}
          >
            {body}
          </FiltersSheet>
        ) : (
          <FiltersPopover open={open} onOpenChange={setOpen} trigger={trigger}>
            {body}
          </FiltersPopover>
        )}
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters" role="group">
          {chips.map(chip => (
            <button
              key={chip.key}
              type="button"
              aria-label={`Remove ${chip.label}`}
              {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'Remove filter chip', 'filter')}
              onClick={chip.onRemove}
              className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-divider pr-1.5 pl-2.5 text-browseSection text-text transition-colors hover:bg-grey-02"
            >
              <span className="truncate">{chip.label}</span>
              <CloseSmall />
            </button>
          ))}
          <ClearLink analyticsSurface={analyticsSurface} onClick={onClearAll} className="text-browseSection">
            Clear
          </ClearLink>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The panel's search box: the app's input, 32px tall on a desktop and 36px on a phone as the build
 * spec has it, so it lines up with the Filters pill beside it.
 */
function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2">
        <Search />
      </span>
      <input
        value={value}
        onChange={event => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid="hub-filters-search"
        className={cx(inputStyles({ withSearchIcon: true }), 'h-8 py-0 md:h-9')}
      />
    </div>
  );
}

function ClearLink({
  analyticsSurface,
  onClick,
  className,
  children,
}: {
  analyticsSurface: DebateAnalyticsSurface;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'Clear all filters', 'filter')}
      onClick={onClick}
      className={cx('text-grey-04 underline transition-colors hover:text-text', className)}
    >
      {children}
    </button>
  );
}

function FiltersPopover({
  open,
  onOpenChange,
  trigger,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const portal = useElevatedPopoverPortal();
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      {portal ? (
        <Popover.Portal container={portal}>
          {/* Radix closes this on any outside press, which is the "click anywhere outside" the
              ticket asks for; its wrapper carries `data-radix-popper-content-wrapper`, which the
              panel's own outside-press handler already leaves alone. The panel's width less its
              16px gutters, as the prototype draws it. */}
          <Popover.Content
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={16}
            aria-label="Filters"
            className="z-100 flex w-[368px] max-w-[calc(100vw-32px)] flex-col gap-3.5 rounded-xl border border-grey-02 bg-white p-3.5 shadow-popover"
          >
            {children}
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}

/**
 * The phone version, the app's bottom sheet: a modal with a backdrop, a focus trap and Escape.
 * Portaled into the panel's own sheet so it stays inside that sheet's focus trap, with Clear all in
 * its header and Show N across its foot as the phone board draws it.
 */
function FiltersSheet({
  open,
  onOpenChange,
  trigger,
  onClearAll,
  analyticsSurface,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  onClearAll?: () => void;
  analyticsSurface: DebateAnalyticsSurface;
  children: React.ReactNode;
}) {
  const portal = useElevatedPopoverPortal();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title="Filters"
      showTitle
      headerAction={
        onClearAll ? (
          <ClearLink analyticsSurface={analyticsSurface} onClick={onClearAll} className="text-metadata">
            Clear all
          </ClearLink>
        ) : undefined
      }
      container={portal}
    >
      <div className="flex flex-col gap-5">{children}</div>
    </BottomSheet>
  );
}

function FiltersBody<S extends string, C extends string>({
  analyticsSurface,
  sort,
  choice,
  toggles,
  facets,
  resultCount,
  hasSelection,
  onClearAll,
  onDone,
  phone,
}: {
  analyticsSurface: DebateAnalyticsSurface;
  sort: Props<S, C>['sort'];
  choice?: HubFilterChoice<C>;
  toggles: HubFilterToggle[];
  facets?: HubFacetFilter | null;
  resultCount: number | null;
  hasSelection: boolean;
  onClearAll: () => void;
  onDone: () => void;
  phone: boolean;
}) {
  const optionAttributes = (name: string) => (option: { label: string }) =>
    debateSurfaceAnalyticsAttributes(analyticsSurface, `${name} ${option.label}`, 'filter');
  const show = (
    <HubPillButton
      variant="primary"
      analyticsSurface={analyticsSurface}
      analyticsLabel="Show filtered results"
      onClick={onDone}
      className={phone ? 'h-11 w-full text-input' : undefined}
    >
      {resultCount === null ? 'Show' : `Show ${resultCount}`}
    </HubPillButton>
  );

  return (
    <>
      <FilterSection heading="Sort">
        <SegmentedControl
          label="Sort"
          variant="tinted"
          size={phone ? 'large' : 'default'}
          options={sort.options}
          value={sort.value}
          onChange={sort.onChange}
          optionAttributes={optionAttributes('Sort')}
        />
      </FilterSection>

      {choice ? (
        <FilterSection heading={choice.heading}>
          <SegmentedControl
            label={choice.heading}
            variant="tinted"
            size={phone ? 'large' : 'default'}
            options={choice.options}
            value={choice.value}
            onChange={choice.onChange}
            optionAttributes={optionAttributes(choice.heading)}
          />
        </FilterSection>
      ) : null}

      {toggles.length > 0 ? (
        <div className="flex flex-col">
          {toggles.map(toggle => (
            <button
              key={toggle.id}
              type="button"
              role="checkbox"
              aria-checked={toggle.checked}
              {...debateSurfaceAnalyticsAttributes(analyticsSurface, toggle.label, 'filter')}
              onClick={() => toggle.onChange(!toggle.checked)}
              className={cx(
                '-mx-1.5 flex items-center gap-2 rounded-md p-1.5 text-left text-metadata transition-colors hover:bg-grey-01 md:min-h-11',
                toggle.checked ? 'text-text' : 'text-grey-04'
              )}
            >
              <CheckboxVisual variant="filled" checked={toggle.checked} />
              {toggle.label}
            </button>
          ))}
        </div>
      ) : null}

      {facets && (facets.options.length > 0 || facets.pickedSpaceIds.length + facets.pickedTopicIds.length > 0) ? (
        <FilterSection heading={facets.heading}>
          <FacetFilterPills
            analyticsSurface={analyticsSurface}
            options={facets.options}
            pickedIds={[...facets.pickedSpaceIds, ...facets.pickedTopicIds]}
            onToggle={facets.onToggle}
            onClear={facets.onClear}
            countsPending={facets.countsPending}
          />
          <p className="mt-2 text-browseSection text-grey-04">
            Each pick narrows further. Counts show what’s left if you add it.
          </p>
        </FilterSection>
      ) : null}

      {phone ? (
        <div className="-mx-4 border-t border-divider px-4 pt-3">{show}</div>
      ) : (
        <div className="flex items-center justify-between gap-3 border-t border-divider pt-3">
          {/* Only once there is something to clear (decision 30); Show stays right-aligned either way. */}
          {hasSelection ? (
            <ClearLink analyticsSurface={analyticsSurface} onClick={onClearAll} className="text-breadcrumb">
              Clear all
            </ClearLink>
          ) : (
            <span />
          )}
          {show}
        </div>
      )}
    </>
  );
}

/** The prototype's `.box`: 14px, a grey outline, filled black when on. */
function FilterSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className={cx('mb-2', HUB_EYEBROW_CLASS_NAME)}>{heading}</h3>
      {children}
    </section>
  );
}

/**
 * The Filters bar for a panel list (GEO-3463), wired the one way every list wires it: the list's
 * spaces and topics as the pill row under the panel's rules, named from the sidebar's labels, picks
 * toggled by kind, and Clear all resetting them along with the tab's own switches. People, Matches
 * and Explore each drew this by hand before; this is that wiring once.
 */
export function PanelFiltersBar({
  analyticsSurface = 'hub',
  filters,
  search,
  onSearchChange,
  searchPlaceholder,
  facetHeading = 'Spaces and topics',
  spaces,
  topics,
  spaceIds,
  topicIds,
  onSpaceToggle,
  onSpacesClear,
  onTopicIdsChange,
  spacesAreExclusive = true,
  listedCount,
  resultCount,
  countsPending,
}: {
  analyticsSurface?: DebateAnalyticsSurface;
  filters: PanelListFilters;
  search: string;
  onSearchChange: (next: string) => void;
  searchPlaceholder: string;
  facetHeading?: string;
  spaces: { id: string; count: number }[];
  topics?: { id: string; name: string | null; count: number }[];
  spaceIds: string[];
  topicIds?: string[];
  onSpaceToggle: (spaceId: string) => void;
  onSpacesClear: () => void;
  onTopicIdsChange?: (update: (current: string[]) => string[]) => void;
  spacesAreExclusive?: boolean;
  /** Distinct rows under the current filters, for which pills still narrow; 0 while unknown. */
  listedCount: number;
  resultCount: number | null;
  countsPending?: boolean;
}) {
  // The picked ids too: the chip names a pick from these labels even when the rows have left it.
  const { labelsById, isLoading: labelsLoading } = useSpaceLabels(
    React.useMemo(() => [...new Set([...spaces.map(space => space.id), ...spaceIds])], [spaces, spaceIds])
  );
  const clearFacets = React.useCallback(() => {
    onSpacesClear();
    onTopicIdsChange?.(() => []);
  }, [onSpacesClear, onTopicIdsChange]);

  const facets = React.useMemo<HubFacetFilter>(
    () => ({
      heading: facetHeading,
      options: panelFacetOptions({
        spaces,
        topics,
        spaceIds,
        topicIds,
        listedCount,
        labelsById,
        labelsLoading,
        spacesAreExclusive,
      }),
      pickedSpaceIds: spaceIds,
      pickedTopicIds: topicIds ?? [],
      onToggle: option =>
        option.kind === 'space'
          ? onSpaceToggle(option.id)
          : onTopicIdsChange?.(current => toggleId(current, option.id)),
      onClear: clearFacets,
      countsPending,
    }),
    [
      clearFacets,
      countsPending,
      facetHeading,
      labelsById,
      labelsLoading,
      listedCount,
      onSpaceToggle,
      onTopicIdsChange,
      spaceIds,
      spaces,
      spacesAreExclusive,
      topicIds,
      topics,
    ]
  );

  return (
    <HubFiltersBar
      analyticsSurface={analyticsSurface}
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder={searchPlaceholder}
      sort={filters.sort}
      choice={filters.choice}
      toggles={filters.toggles}
      facets={facets}
      resultCount={resultCount}
      onClearAll={() => {
        clearFacets();
        filters.onClearExtras?.();
      }}
    />
  );
}

/**
 * The pill row's options under the panel's rules (decision 26): spaces lead, and topics join once a
 * space is picked — or straight away when there is no space to pick, because every listed claim is
 * in the one. Each kind drops what would not narrow the list and keeps its picks first, the way the
 * debate-again picker orders its own row.
 *
 * Every pick narrows (AND). A listed claim lives in one space, so once a space is picked the other
 * spaces would each leave nothing; they drop out rather than sit there at zero.
 */
export function panelFacetOptions({
  spaces,
  topics,
  spaceIds,
  topicIds,
  listedCount,
  labelsById,
  labelsLoading,
  spacesAreExclusive = true,
}: {
  spaces: { id: string; count: number }[];
  topics?: { id: string; name: string | null; count: number }[];
  spaceIds: string[];
  topicIds?: string[];
  /** Distinct rows under the current filters; 0 while unknown, which drops nothing. */
  listedCount: number;
  labelsById: Map<string, SpaceLabel>;
  labelsLoading: boolean;
  /**
   * Whether a row belongs to one space only (claims) or to several (people, who are active in many).
   * Exclusive spaces drop the unpicked ones once one is picked, since none of them could narrow.
   */
  spacesAreExclusive?: boolean;
}): FacetPillOption[] {
  const picked = new Set(spaceIds.map(normId));
  // A pill that would leave nothing drops out rather than sitting there at zero; a picked one stays,
  // because the row is also how it is un-picked.
  const pickedTopics = new Set((topicIds ?? []).map(normId));
  const spacePool = (
    spacesAreExclusive && picked.size > 0 ? spaces.filter(space => picked.has(normId(space.id))) : spaces
  ).filter(space => space.count > 0 || picked.has(normId(space.id)));
  const spaceOptions = orderFacetOptions(narrowingOptions(spacePool, listedCount, spaceIds), spaceIds).map(space => {
    const label = spaceLabel(labelsById, space.id);
    return {
      kind: 'space' as const,
      id: space.id,
      name: label?.name ?? (labelsLoading ? null : 'Space'),
      image: label?.image ?? null,
      count: space.count,
    };
  });

  const showTopics = topics && topicIds && (spaceIds.length > 0 || topicIds.length > 0 || spaceOptions.length === 0);
  const topicOptions = showTopics
    ? orderFacetOptions(
        narrowingOptions(
          topics.filter(topic => topic.count > 0 || pickedTopics.has(normId(topic.id))),
          listedCount,
          topicIds
        ),
        topicIds
      ).map(topic => ({
        kind: 'topic' as const,
        id: topic.id,
        name: topic.name,
        count: topic.count,
      }))
    : [];

  return [...spaceOptions, ...topicOptions];
}
