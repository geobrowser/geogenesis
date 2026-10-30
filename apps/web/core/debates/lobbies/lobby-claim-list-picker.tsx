'use client';

import * as React from 'react';

import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { ID } from '~/core/id';

import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';
import { Tooltip } from '~/design-system/tooltip';

import { type DebateLobbyClaimList, LOBBY_CLAIM_LISTS_MAX } from '../api';
import {
  type ClaimListCounts,
  type ClaimListOption,
  type ClaimListSpaceGroup,
  claimListCounts,
  groupClaimListOptions,
  searchClaimListGroups,
  useClaimListCatalog,
} from '../claim-list-pages';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubQueryState } from '../matchmaking/hub-states';
import { todaysListCounts, useTodaysClaimsList } from '../todays-claims/todays-claims-list';
import { TODAYS_CLAIMS_LIST_ID, TODAYS_CLAIMS_LIST_NAME } from '../todays-claims/todays-claims-list-id';
import { useDebatePublishableSpaces } from '../use-debate-publishable-spaces';
import { useSaveLobbyClaimList } from './lobby-claim-lists-hooks';
import { moderationErrorMessage } from './lobby-format';
import { LobbyPopup } from './lobby-popup';

export const CLAIM_LIST_PICKER_COPY = {
  title: 'Add a claim list',
  add: 'Add a claim list',
  full: 'Remove a list to add another',
  search: 'Search claim lists',
  added: 'Added',
  adding: 'Adding…',
  none: 'No claim lists yet. A page tagged Debate in its own space shows up here.',
  noMatch: (query: string) => `No claim lists match “${query}”.`,
  addFailed: 'Could not add the list. Try again.',
};

/** Spaces shown before the host scrolls for more. */
const SPACES_PER_STEP = 8;
const SCROLL_ATTRIBUTE = 'data-claim-list-picker-scroll';

/**
 * The host's "+" after the claims tabs (GEO-3274). Opens a picker of claim list pages, grouped by
 * space; a pick adds the page as a tab for everyone. A popover on desktop, a bottom sheet on phones.
 */
export function LobbyClaimListPicker({
  lobbyId,
  lists,
  onAdded,
}: {
  lobbyId: string;
  lists: DebateLobbyClaimList[];
  /** The page just added, so the host lands on its tab. */
  onAdded: (entityId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const full = lists.length >= LOBBY_CLAIM_LISTS_MAX;

  if (full) {
    return (
      <Tooltip
        label={CLAIM_LIST_PICKER_COPY.full}
        // The button does nothing, so on a touchscreen a press is the only way to read why.
        openOnPress
        trigger={
          <AddButton
            disabled
            {...debateActionAnalyticsAttributes('hub', 'Lobby add claim list full', 'add_lobby_claim_list')}
          />
        }
      />
    );
  }

  return (
    <LobbyPopup
      open={open}
      onOpenChange={setOpen}
      title={CLAIM_LIST_PICKER_COPY.title}
      wide
      trigger={
        <AddButton {...debateActionAnalyticsAttributes('hub', 'Lobby add claim list', 'add_lobby_claim_list')} />
      }
    >
      <ClaimListPickerContent
        lobbyId={lobbyId}
        lists={lists}
        onAdded={entityId => {
          setOpen(false);
          onAdded(entityId);
        }}
      />
    </LobbyPopup>
  );
}

const AddButton = React.forwardRef<
  HTMLButtonElement,
  { disabled?: boolean } & React.ComponentPropsWithoutRef<'button'>
>(function AddButton({ disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={disabled ? CLAIM_LIST_PICKER_COPY.full : CLAIM_LIST_PICKER_COPY.add}
      // `aria-disabled` rather than `disabled`, so the tooltip still opens on hover and focus.
      aria-disabled={disabled ? 'true' : undefined}
      onClick={disabled ? event => event.preventDefault() : undefined}
      {...props}
      className={
        disabled
          ? 'mb-2 grid size-6 shrink-0 cursor-not-allowed place-items-center rounded-full bg-grey-01 text-grey-03'
          : 'mb-2 grid size-6 shrink-0 place-items-center rounded-full bg-grey-01 text-text transition-colors hover:bg-grey-02'
      }
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
});

/** The in-lobby picker: a pick adds the page to the lobby at once. */
export function ClaimListPickerContent({
  lobbyId,
  lists,
  onAdded,
}: {
  lobbyId: string;
  lists: DebateLobbyClaimList[];
  onAdded: (entityId: string) => void;
}) {
  const save = useSaveLobbyClaimList(lobbyId);
  const [picking, setPicking] = React.useState<string | null>(null);
  const addedIds = React.useMemo(() => lists.map(list => list.entity_id), [lists]);

  return (
    <ClaimListPicker
      addedIds={addedIds}
      pickingId={picking}
      disabled={save.isPending}
      analyticsLabel="Lobby pick claim list"
      onPick={option => {
        setPicking(option.entityId);
        save.mutate(
          { entityId: option.entityId, spaceId: option.spaceId },
          { onSuccess: () => onAdded(option.entityId), onSettled: () => setPicking(null) }
        );
      }}
      footer={
        save.error ? (
          <Text as="p" variant="footnote" color="red-01">
            {moderationErrorMessage(save.error, CLAIM_LIST_PICKER_COPY.addFailed)}
          </Text>
        ) : null
      }
    />
  );
}

/**
 * The claim list picker itself: eligible pages grouped by space, highest-scored space first, A to Z
 * within, searchable, each row counted as its tab will draw it. What a pick does is the caller's:
 * the in-lobby "+" adds it to the lobby, the Open a debate lobby dialog collects it (GEO-3275).
 */
export function ClaimListPicker({
  addedIds,
  onPick,
  pickingId = null,
  disabled = false,
  analyticsLabel,
  footer,
}: {
  /** Pages already chosen, shown as added and not offered again. Any id spelling. */
  addedIds: readonly string[];
  onPick: (option: ClaimListOption) => void;
  /** The page a pick is in flight for, which reads "Adding…". */
  pickingId?: string | null;
  disabled?: boolean;
  /** Each row's click label, so the two places it is used can be told apart. */
  analyticsLabel: string;
  footer?: React.ReactNode;
}) {
  const [query, setQuery] = React.useState('');
  const [shown, setShown] = React.useState(SPACES_PER_STEP);
  const catalog = useClaimListCatalog();

  const added = React.useMemo(() => new Set(addedIds.map(id => ID.uuidToHex(id))), [addedIds]);
  const spaceIds = React.useMemo(
    () => [...new Set((catalog.data?.options ?? []).map(option => option.spaceId))],
    [catalog.data]
  );
  const { labelsById } = useSpaceLabels(spaceIds);
  const { publishableSpaceIds } = useDebatePublishableSpaces();
  // Counted as the tab will draw them, and a page with nothing it could show is not offered.
  const counted = React.useMemo(() => {
    const counts = new Map<ClaimListOption, ClaimListCounts>();
    for (const option of catalog.data?.options ?? []) counts.set(option, claimListCounts(option, publishableSpaceIds));
    return counts;
  }, [catalog.data, publishableSpaceIds]);
  const groups = React.useMemo(() => {
    if (!catalog.data) return [];
    const options = catalog.data.options.filter(option => (counted.get(option)?.themeCount ?? 0) > 0);
    const ranked = groupClaimListOptions(
      { ...catalog.data, options },
      spaceId => spaceLabel(labelsById, spaceId)?.name
    );
    return searchClaimListGroups(ranked, query);
  }, [catalog.data, counted, labelsById, query]);
  const todays = useTodaysOption(query);
  const visible = groups.slice(0, shown);
  const hasMore = groups.length > shown;
  const sentinel = useInfiniteScrollSentinel({
    hasNextPage: hasMore,
    isFetchingNextPage: false,
    fetchNextPage: () => setShown(count => count + SPACES_PER_STEP),
    rootSelector: `[${SCROLL_ATTRIBUTE}]`,
    rootMargin: '120px',
  });

  return (
    <div className="flex flex-col gap-2 p-3" role="group" aria-label={CLAIM_LIST_PICKER_COPY.title}>
      <Text as="p" variant="metadataMedium">
        {CLAIM_LIST_PICKER_COPY.title}
      </Text>
      <Input
        withSearchIcon
        value={query}
        placeholder={CLAIM_LIST_PICKER_COPY.search}
        aria-label={CLAIM_LIST_PICKER_COPY.search}
        onChange={event => {
          setQuery(event.target.value);
          setShown(SPACES_PER_STEP);
        }}
        // Search is live, so Enter has nothing to do here. Left alone, it would submit a form the
        // picker sits in: in the Open a debate lobby dialog, opening the lobby mid-search.
        onKeyDown={event => {
          if (event.key === 'Enter') event.preventDefault();
        }}
      />
      <div {...{ [SCROLL_ATTRIBUTE]: '' }} className="-mx-3 max-h-[min(420px,55vh)] overflow-y-auto px-3">
        {/* Outside the catalog's states: the agendas load on their own, so a slow or failed catalog
            does not keep Today's claims from being added. */}
        {todays.shown ? (
          <div className="mb-2">
            <TodaysClaimsRow
              counts={todays.counts}
              isAdded={added.has(TODAYS_CLAIMS_LIST_ID)}
              isPicking={pickingId === TODAYS_CLAIMS_LIST_ID}
              disabled={disabled}
              analyticsLabel={analyticsLabel}
              onPick={onPick}
            />
          </div>
        ) : null}
        <HubQueryState
          analyticsSurface="hub"
          isLoading={catalog.isLoading}
          error={catalog.error}
          onRetry={() => void catalog.refetch()}
          isEmpty={groups.length === 0 && !todays.shown}
          emptyMessage={query.trim() ? CLAIM_LIST_PICKER_COPY.noMatch(query.trim()) : CLAIM_LIST_PICKER_COPY.none}
        >
          <div className="flex flex-col gap-2">
            {visible.map(group => (
              <SpaceGroup
                key={group.spaceId}
                group={group}
                counts={counted}
                added={added}
                picking={pickingId}
                disabled={disabled}
                analyticsLabel={analyticsLabel}
                onPick={onPick}
              />
            ))}
            {hasMore ? <div ref={sentinel} className="h-1" aria-hidden /> : null}
          </div>
        </HubQueryState>
      </div>
      {footer}
    </div>
  );
}

/** Today's claims as a picker option: no page, so no themes; its tab reads the newest agendas. */
const TODAYS_CLAIMS_OPTION: ClaimListOption = {
  entityId: TODAYS_CLAIMS_LIST_ID,
  spaceId: TODAYS_CLAIMS_LIST_ID,
  name: TODAYS_CLAIMS_LIST_NAME,
  themes: [],
};

/**
 * GEO-3491. Whether the pinned Today's claims row shows, and its counts once known: while the agendas
 * load, and once they list a claim the tab would draw. A search hides it unless its name matches.
 */
function useTodaysOption(query: string) {
  const { sections, isLoading, error } = useTodaysClaimsList({ ordered: false });
  const counts = isLoading ? null : todaysListCounts(sections);
  const needle = query.trim().toLocaleLowerCase();
  const matches = !needle || TODAYS_CLAIMS_LIST_NAME.toLocaleLowerCase().includes(needle);
  const shown = matches && !error && (counts === null || counts.claimCount > 0);
  return { shown, counts };
}

/** The pinned row above the spaces' lists, set off from them by a rule. */
function TodaysClaimsRow({
  counts,
  isAdded,
  isPicking,
  disabled,
  analyticsLabel,
  onPick,
}: {
  counts: { spaceCount: number; claimCount: number } | null;
  isAdded: boolean;
  isPicking: boolean;
  disabled: boolean;
  analyticsLabel: string;
  onPick: (option: ClaimListOption) => void;
}) {
  return (
    <div className="border-b border-grey-02 pb-2">
      <ClaimListPickerRow
        name={TODAYS_CLAIMS_LIST_NAME}
        detail={
          counts ? (
            `${counts.spaceCount} ${counts.spaceCount === 1 ? 'space' : 'spaces'} · ${counts.claimCount} ${counts.claimCount === 1 ? 'claim' : 'claims'}`
          ) : (
            <span className="mt-1 block h-3 w-24 animate-pulse rounded bg-grey-01" aria-hidden />
          )
        }
        isAdded={isAdded}
        isPicking={isPicking}
        disabled={disabled}
        analyticsLabel={`${analyticsLabel} Today’s claims`}
        onClick={() => onPick(TODAYS_CLAIMS_OPTION)}
      />
    </div>
  );
}

/** One option in the picker: a list's name over its counts, and whether it is added or being added. */
function ClaimListPickerRow({
  name,
  detail,
  isAdded,
  isPicking,
  disabled,
  analyticsLabel,
  onClick,
}: {
  name: string;
  detail: React.ReactNode;
  isAdded: boolean;
  isPicking: boolean;
  disabled: boolean;
  analyticsLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={isAdded || disabled}
      {...debateActionAnalyticsAttributes('hub', analyticsLabel, 'add_lobby_claim_list')}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-grey-01 disabled:hover:bg-transparent"
    >
      <span className="flex min-w-0 flex-col">
        <Text as="span" variant="metadataMedium" color={isAdded ? 'grey-03' : 'text'} className="truncate">
          {name}
        </Text>
        <Text as="span" variant="footnote" color="grey-04">
          {detail}
        </Text>
      </span>
      {isAdded || isPicking ? (
        <Text as="span" variant="footnote" color="grey-04" className="shrink-0">
          {isAdded ? CLAIM_LIST_PICKER_COPY.added : CLAIM_LIST_PICKER_COPY.adding}
        </Text>
      ) : null}
    </button>
  );
}

function SpaceGroup({
  group,
  counts,
  added,
  picking,
  disabled,
  analyticsLabel,
  onPick,
}: {
  group: ClaimListSpaceGroup;
  counts: ReadonlyMap<ClaimListOption, ClaimListCounts>;
  added: ReadonlySet<string>;
  picking: string | null;
  disabled: boolean;
  analyticsLabel: string;
  onPick: (option: ClaimListOption) => void;
}) {
  return (
    <section aria-label={group.spaceName ?? 'Space'} className="flex flex-col">
      <Text as="h3" variant="footnoteMedium" color="grey-04" className="px-2 pt-1 pb-1 uppercase">
        {group.spaceName ?? 'Space'}
      </Text>
      {group.options.map(option => {
        const isAdded = added.has(ID.uuidToHex(option.entityId));
        const { themeCount, claimCount } = counts.get(option) ?? { themeCount: 0, claimCount: 0 };
        return (
          <ClaimListPickerRow
            key={option.entityId}
            name={option.name}
            detail={`${themeCount} ${themeCount === 1 ? 'theme' : 'themes'} · ${claimCount} ${claimCount === 1 ? 'claim' : 'claims'}`}
            isAdded={isAdded}
            isPicking={picking === option.entityId}
            disabled={disabled}
            analyticsLabel={analyticsLabel}
            onClick={() => onPick(option)}
          />
        );
      })}
    </section>
  );
}
