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
  type ClaimListOption,
  type ClaimListSpaceGroup,
  groupClaimListOptions,
  searchClaimListGroups,
  useClaimListCatalog,
} from '../claim-list-pages';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubQueryState } from '../matchmaking/hub-states';
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

export function ClaimListPickerContent({
  lobbyId,
  lists,
  onAdded,
}: {
  lobbyId: string;
  lists: DebateLobbyClaimList[];
  onAdded: (entityId: string) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [shown, setShown] = React.useState(SPACES_PER_STEP);
  const catalog = useClaimListCatalog();
  const save = useSaveLobbyClaimList(lobbyId);
  const [picking, setPicking] = React.useState<string | null>(null);

  const added = React.useMemo(() => new Set(lists.map(list => ID.uuidToHex(list.entity_id))), [lists]);
  const spaceIds = React.useMemo(
    () => [...new Set((catalog.data?.options ?? []).map(option => option.spaceId))],
    [catalog.data]
  );
  const { labelsById } = useSpaceLabels(spaceIds);
  const groups = React.useMemo(() => {
    if (!catalog.data) return [];
    const ranked = groupClaimListOptions(catalog.data, spaceId => spaceLabel(labelsById, spaceId)?.name);
    return searchClaimListGroups(ranked, query);
  }, [catalog.data, labelsById, query]);
  const visible = groups.slice(0, shown);
  const hasMore = groups.length > shown;
  const sentinel = useInfiniteScrollSentinel({
    hasNextPage: hasMore,
    isFetchingNextPage: false,
    fetchNextPage: () => setShown(count => count + SPACES_PER_STEP),
    rootSelector: `[${SCROLL_ATTRIBUTE}]`,
    rootMargin: '120px',
  });

  const pick = (option: ClaimListOption) => {
    setPicking(option.entityId);
    save.mutate(
      { entityId: option.entityId, spaceId: option.spaceId },
      { onSuccess: () => onAdded(option.entityId), onSettled: () => setPicking(null) }
    );
  };

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
      />
      <div {...{ [SCROLL_ATTRIBUTE]: '' }} className="-mx-3 max-h-[min(420px,55vh)] overflow-y-auto px-3">
        <HubQueryState
          analyticsSurface="hub"
          isLoading={catalog.isLoading}
          error={catalog.error}
          onRetry={() => void catalog.refetch()}
          isEmpty={groups.length === 0}
          emptyMessage={query.trim() ? CLAIM_LIST_PICKER_COPY.noMatch(query.trim()) : CLAIM_LIST_PICKER_COPY.none}
        >
          <div className="flex flex-col gap-2">
            {visible.map(group => (
              <SpaceGroup
                key={group.spaceId}
                group={group}
                added={added}
                picking={picking}
                disabled={save.isPending}
                onPick={pick}
              />
            ))}
            {hasMore ? <div ref={sentinel} className="h-1" aria-hidden /> : null}
          </div>
        </HubQueryState>
      </div>
      {save.error ? (
        <Text as="p" variant="footnote" color="red-01">
          {moderationErrorMessage(save.error, CLAIM_LIST_PICKER_COPY.addFailed)}
        </Text>
      ) : null}
    </div>
  );
}

function SpaceGroup({
  group,
  added,
  picking,
  disabled,
  onPick,
}: {
  group: ClaimListSpaceGroup;
  added: ReadonlySet<string>;
  picking: string | null;
  disabled: boolean;
  onPick: (option: ClaimListOption) => void;
}) {
  return (
    <section aria-label={group.spaceName ?? 'Space'} className="flex flex-col">
      <Text as="h3" variant="footnoteMedium" color="grey-04" className="px-2 pt-1 pb-1 uppercase">
        {group.spaceName ?? 'Space'}
      </Text>
      {group.options.map(option => {
        const isAdded = added.has(ID.uuidToHex(option.entityId));
        return (
          <button
            key={option.entityId}
            type="button"
            disabled={isAdded || disabled}
            {...debateActionAnalyticsAttributes('hub', 'Lobby pick claim list', 'add_lobby_claim_list')}
            onClick={() => onPick(option)}
            className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-grey-01 disabled:hover:bg-transparent"
          >
            <span className="flex min-w-0 flex-col">
              <Text as="span" variant="metadataMedium" color={isAdded ? 'grey-03' : 'text'} className="truncate">
                {option.name}
              </Text>
              <Text as="span" variant="footnote" color="grey-04">
                {option.themeCount} {option.themeCount === 1 ? 'theme' : 'themes'} · {option.claimCount}{' '}
                {option.claimCount === 1 ? 'claim' : 'claims'}
              </Text>
            </span>
            {isAdded || picking === option.entityId ? (
              <Text as="span" variant="footnote" color="grey-04" className="shrink-0">
                {isAdded ? CLAIM_LIST_PICKER_COPY.added : CLAIM_LIST_PICKER_COPY.adding}
              </Text>
            ) : null}
          </button>
        );
      })}
    </section>
  );
}
