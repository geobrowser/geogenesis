'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { type SpaceLabel, spaceLabel } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';

import { CheckboxVisual } from '~/design-system/checkbox';
import { CloseSmall } from '~/design-system/icons/close-small';
import { Input } from '~/design-system/input';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import type { DebateClaimPositionSummary } from '../api';
import type { TaggedClaimOrder } from '../tagged-claims';
import { type ClaimOrderFacts, compareByNewest, compareByRanking } from './claim-order-facts';
import { FacetFilterPills, type FacetPillOption } from './facet-filter-pills';
import { type DebateAnalyticsSurface, debateSurfaceAnalyticsAttributes } from './hub-analytics';
import { HubPillButton, hubPillClassName } from './hub-pill-button';
import { narrowingOptions, orderFacetOptions } from './topic-facets';

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
  pickedIds: string[];
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
};

export type ClaimRowSort = 'best' | 'newest' | 'people';

type SortableClaimRow = {
  claim: { claim_entity_id: string };
  positions: DebateClaimPositionSummary[];
  viewer_response?: { position: boolean } | null;
};

/** People who could take the other side right now, the "Most people" sort's measure. */
export function opposingPeopleCount(row: SortableClaimRow) {
  const viewerSide = row.viewer_response?.position;
  return row.positions
    .filter(position => viewerSide === undefined || position.position !== viewerSide)
    .reduce((sum, position) => sum + position.available_now_count, 0);
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
  /** Above the search row, inside the same sticky block (the People tab's sent-challenge card). */
  leading?: React.ReactNode;
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
  leading,
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
      const byId = new Map(facets.options.map(option => [normId(option.id), option]));
      for (const id of facets.pickedIds) {
        const option = byId.get(normId(id));
        active.push({
          key: `facet:${id}`,
          label: option?.name ?? (option?.kind === 'topic' ? 'Topic' : 'Space'),
          onRemove: () => facets.onToggle(option ?? { kind: 'space', id, name: null, count: 0 }),
        });
      }
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
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[13px] leading-none text-text"
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
    />
  );

  return (
    <div className="flex flex-col gap-2">
      {leading}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            withSearchIcon
            value={search}
            onChange={event => onSearchChange(event.currentTarget.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
        {isMobile ? (
          <FiltersSheet open={open} onOpenChange={setOpen} trigger={trigger}>
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
              className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-grey-02 bg-white pr-1.5 pl-2.5 text-footnote text-text transition-colors hover:bg-grey-01"
            >
              <span className="truncate">{chip.label}</span>
              <CloseSmall />
            </button>
          ))}
        </div>
      ) : null}
    </div>
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
              panel's own outside-press handler already leaves alone. */}
          <Popover.Content
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={16}
            aria-label="Filters"
            className="z-100 flex w-[368px] max-w-[calc(100vw-32px)] flex-col gap-3.5 rounded-xl border border-grey-02 bg-white p-3.5 shadow-lg"
          >
            {children}
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}

/**
 * The phone version. A Dialog rather than a popover: it needs a backdrop, a focus trap and Escape,
 * and the panel's own Escape handler already steps aside for an `aria-modal` dialog that isn't the
 * panel itself. The card is Content *inside* Overlay, so a press on the backdrop reaches the
 * overlay and dismisses — a full-screen Content would swallow it.
 */
function FiltersSheet({
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      {portal ? (
        <Dialog.Portal container={portal}>
          <Dialog.Overlay className="fixed inset-0 z-[220] flex items-end bg-grey-04/50">
            {/* `aria-modal` said outright: the panel's Escape handler steps aside for a modal dialog
                that isn't the panel, and Radix does not set the attribute itself. */}
            <Dialog.Content
              aria-modal="true"
              aria-describedby={undefined}
              className="flex max-h-[85dvh] w-full flex-col gap-3.5 overflow-y-auto rounded-t-xl bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-center justify-between">
                <Dialog.Title className="text-smallTitle text-text">Filters</Dialog.Title>
                <Dialog.Close
                  aria-label="Close filters"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-grey-04 hover:bg-grey-01"
                >
                  <CloseSmall />
                </Dialog.Close>
              </div>
              {children}
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      ) : null}
    </Dialog.Root>
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
}) {
  return (
    <>
      <FilterSection heading="Sort">
        <Segmented
          analyticsSurface={analyticsSurface}
          analyticsName="Sort"
          options={sort.options}
          value={sort.value}
          onChange={sort.onChange}
        />
      </FilterSection>

      {choice ? (
        <FilterSection heading={choice.heading}>
          <Segmented
            analyticsSurface={analyticsSurface}
            analyticsName={choice.heading}
            options={choice.options}
            value={choice.value}
            onChange={choice.onChange}
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
              className="-mx-1.5 flex min-h-8 items-center gap-2.5 rounded-lg px-1.5 text-left text-metadata text-text transition-colors hover:bg-grey-01 md:min-h-11"
            >
              <CheckboxVisual checked={toggle.checked} />
              {toggle.label}
            </button>
          ))}
        </div>
      ) : null}

      {facets && (facets.options.length > 0 || facets.pickedIds.length > 0) ? (
        <FilterSection heading={facets.heading}>
          <FacetFilterPills
            analyticsSurface={analyticsSurface}
            options={facets.options}
            pickedIds={facets.pickedIds}
            onToggle={facets.onToggle}
            onClear={facets.onClear}
            countsPending={facets.countsPending}
          />
        </FilterSection>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-divider pt-3">
        {/* Only once there is something to clear (decision 30); Show stays right-aligned either way. */}
        {hasSelection ? (
          <button
            type="button"
            {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'Clear all filters', 'filter')}
            onClick={onClearAll}
            className="text-metadata text-text underline transition-colors hover:text-grey-04"
          >
            Clear all
          </button>
        ) : (
          <span />
        )}
        <HubPillButton
          variant="primary"
          analyticsSurface={analyticsSurface}
          analyticsLabel="Show filtered results"
          onClick={onDone}
          className="md:h-11 md:px-5"
        >
          {resultCount === null ? 'Show' : `Show ${resultCount}`}
        </HubPillButton>
      </div>
    </>
  );
}

function FilterSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-footnoteMedium tracking-[0.3px] text-grey-04 uppercase">{heading}</h3>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  analyticsSurface,
  analyticsName,
  options,
  value,
  onChange,
}: {
  analyticsSurface: DebateAnalyticsSurface;
  analyticsName: string;
  options: HubSortOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={analyticsName} className="flex rounded-full bg-grey-01 p-0.5">
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            {...debateSurfaceAnalyticsAttributes(analyticsSurface, `${analyticsName} ${option.label}`, 'filter')}
            onClick={() => onChange(option.value)}
            className={cx(
              'h-[26px] flex-1 rounded-full px-2 text-breadcrumb whitespace-nowrap transition-colors md:h-9',
              selected ? 'bg-white text-text shadow-[0_1px_2px_rgba(0,0,0,0.12)]' : 'text-grey-04 hover:text-text'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
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
