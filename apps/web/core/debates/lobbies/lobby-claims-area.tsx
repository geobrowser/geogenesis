'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { useLocalVotes } from '~/core/state/local-votes';
import { clearSaveVotesPromptLobby, openSaveVotesPrompt } from '~/core/state/save-votes-prompt';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { tabGroupTabLinkStyles } from '~/design-system/tab-group';
import { Text } from '~/design-system/text';

import type { DebateLobbyClaimList } from '../api';
import { debateActionAnalyticsAttributes, hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { ScrollableTabRow } from '../matchmaking/scrollable-tab-row';
import { LobbyClaimListPicker } from './lobby-claim-list-picker';
import { LobbyClaimListTab, useClaimListName } from './lobby-claim-list-tab';
import { useRemoveLobbyClaimList, useSaveLobbyClaimList } from './lobby-claim-lists-hooks';
import { orderedClaimLists } from './lobby-claim-lists-state';
import { claimListKey, useNewClaimListTabs } from './lobby-claims-mark';
import { LobbyExploreClaims } from './lobby-explore-claims';
import { moderationErrorMessage } from './lobby-format';
import { useIsLobbyGuest } from './lobby-guest-hooks';
import { LobbyRoomClaimsWithHighlights, LobbyRoomVote } from './lobby-highlights';
import { LobbyPopup, LobbyPopupMenuRow } from './lobby-popup';
import type { LobbyPageView } from './lobby-view';

/** The two built-in tabs, then one per claim list as `list:<page id>` (GEO-3274). */
export type LobbyClaimsTab = 'room' | 'explore' | `list:${string}`;

const TABS: { id: 'room' | 'explore'; label: string }[] = [
  { id: 'room', label: 'In this room' },
  { id: 'explore', label: 'Explore' },
];

const listTabId = claimListKey;

/**
 * The lobby's claims: "In this room", "Explore", then the claim lists hosts have added, in the
 * debates hub's tab row. Hosts get a "+" after the row to add a list.
 */
export function LobbyClaimsArea({ lobby }: { lobby: LobbyPageView }) {
  const [activeTab, setActiveTab] = React.useState<LobbyClaimsTab>('room');
  useSavePromptOnGuestVote(lobby.name);

  const lists = React.useMemo(() => orderedClaimLists(lobby), [lobby]);
  const activeList = lists.find(list => listTabId(list) === activeTab) ?? null;
  const unseen = useNewClaimListTabs(lists.map(listTabId), activeTab);
  // A list taken off the lobby takes its tab with it; whoever was on it lands back in the room.
  const shownTab: LobbyClaimsTab = activeTab.startsWith('list:') && !activeList ? 'room' : activeTab;
  const hosting = lobby.viewer.hosting;

  return (
    <section className="flex flex-col gap-3" aria-label="Claims">
      <LobbyRoomVote lobby={lobby} />
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <ScrollableTabRow activeKey={shownTab} analyticsLabelPrefix="Lobby claims" className="gap-4">
            {TABS.map(tab => (
              <ClaimsTabButton
                key={tab.id}
                active={shownTab === tab.id}
                analyticsLabel={`Lobby ${tab.label} tab`}
                onSelect={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </ClaimsTabButton>
            ))}
            {lists.map((list, index) => (
              <ClaimListTabButton
                key={list.entity_id}
                lobbyId={lobby.lobby_id}
                list={list}
                index={index}
                count={lists.length}
                active={shownTab === listTabId(list)}
                unseen={unseen.has(listTabId(list))}
                hosting={hosting}
                onSelect={() => setActiveTab(listTabId(list))}
              />
            ))}
          </ScrollableTabRow>
        </div>
        {hosting ? (
          <LobbyClaimListPicker
            lobbyId={lobby.lobby_id}
            lists={lists}
            onAdded={entityId => setActiveTab(listTabId({ entity_id: entityId }))}
          />
        ) : null}
      </div>
      {shownTab === 'room' ? (
        <LobbyRoomClaimsWithHighlights lobby={lobby} onExplore={() => setActiveTab('explore')} />
      ) : shownTab === 'explore' ? (
        <LobbyExploreClaims lobby={lobby} />
      ) : activeList ? (
        <LobbyClaimListTab key={activeList.entity_id} lobby={lobby} list={activeList} />
      ) : null}
    </section>
  );
}

function ClaimsTabButton({
  active,
  analyticsLabel,
  onSelect,
  children,
}: {
  active: boolean;
  analyticsLabel: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      {...hubAnalyticsAttributes(analyticsLabel, 'navigate_lobby_claims')}
      aria-current={active ? 'true' : undefined}
      data-tab-active={active ? 'true' : undefined}
      onClick={onSelect}
      className={tabGroupTabLinkStyles({ active })}
    >
      {children}
      {active && (
        <motion.div
          layoutId="lobby-claims-tab-active-border"
          layout
          initial={false}
          transition={{ duration: 0.2 }}
          className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
        />
      )}
    </button>
  );
}

/** A claim list's tab: its page name, a dot until opened when it arrived mid-visit, and host controls. */
function ClaimListTabButton({
  lobbyId,
  list,
  index,
  count,
  active,
  unseen,
  hosting,
  onSelect,
}: {
  lobbyId: string;
  list: DebateLobbyClaimList;
  index: number;
  count: number;
  active: boolean;
  unseen: boolean;
  hosting: boolean;
  onSelect: () => void;
}) {
  const name = useClaimListName(list);
  return (
    // Not `relative`: the tab row measures the active tab against the row itself.
    <span className="flex items-center gap-1">
      <ClaimsTabButton active={active} analyticsLabel="Lobby claim list tab" onSelect={onSelect}>
        <span className="max-w-[160px] truncate" title={name}>
          {name}
        </span>
        {unseen ? (
          <span
            className="size-1.5 shrink-0 rounded-full bg-ctaPrimary"
            aria-label="New"
            role="img"
            data-testid="new-list-dot"
          />
        ) : null}
      </ClaimsTabButton>
      {hosting ? <ClaimListTabMenu lobbyId={lobbyId} list={list} index={index} count={count} name={name} /> : null}
    </span>
  );
}

/** Move a list's tab left or right, or take it off the lobby. Hosts only; built-in tabs have none. */
function ClaimListTabMenu({
  lobbyId,
  list,
  index,
  count,
  name,
}: {
  lobbyId: string;
  list: DebateLobbyClaimList;
  index: number;
  count: number;
  name: string;
}) {
  const [open, setOpen] = React.useState(false);
  const save = useSaveLobbyClaimList(lobbyId);
  const remove = useRemoveLobbyClaimList(lobbyId);
  const pending = save.isPending || remove.isPending;
  const error = save.error ?? remove.error;
  const done = { onSuccess: () => setOpen(false) };
  const move = (position: number) => save.mutate({ entityId: list.entity_id, spaceId: list.space_id, position }, done);

  return (
    <LobbyPopup
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) {
          save.reset();
          remove.reset();
        }
      }}
      title={`${name} options`}
      trigger={
        <button
          type="button"
          aria-label={`${name} options`}
          {...debateActionAnalyticsAttributes('hub', 'Lobby claim list options', 'open_lobby_claim_list_options')}
          className="grid size-5 shrink-0 place-items-center rounded-full text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
        >
          <ChevronDownSmall />
        </button>
      }
    >
      <div className="flex flex-col" role="group" aria-label={`${name} options`}>
        <LobbyPopupMenuRow
          analyticsIntent="moderate_lobby_claim_list"
          analyticsLabel="Lobby move claim list left"
          disabled={pending || index === 0}
          onClick={() => move(index - 1)}
        >
          Move left
        </LobbyPopupMenuRow>
        <LobbyPopupMenuRow
          analyticsIntent="moderate_lobby_claim_list"
          analyticsLabel="Lobby move claim list right"
          disabled={pending || index === count - 1}
          onClick={() => move(index + 1)}
        >
          Move right
        </LobbyPopupMenuRow>
        <LobbyPopupMenuRow
          analyticsIntent="moderate_lobby_claim_list"
          analyticsLabel="Lobby remove claim list"
          disabled={pending}
          danger
          onClick={() => remove.mutate(list.entity_id, done)}
        >
          Remove from lobby
        </LobbyPopupMenuRow>
        {error ? (
          <Text as="p" variant="footnote" color="red-01" className="px-3 pb-2">
            {moderationErrorMessage(error)}
          </Text>
        ) : null}
      </div>
    </LobbyPopup>
  );
}

/**
 * A guest's vote here opens the save sheet at once, which shows the vote and signs them up in
 * place; elsewhere it waits for a second vote. The lobby has no claim card option for it.
 */
function useSavePromptOnGuestVote(lobbyName: string) {
  const guest = useIsLobbyGuest();
  const count = useLocalVotes().votes.length;
  const seenRef = React.useRef(count);
  React.useEffect(() => {
    const previous = seenRef.current;
    seenRef.current = count;
    if (guest && count > previous) openSaveVotesPrompt('single_claim', { lobbyName });
  }, [count, guest, lobbyName]);
  // The lobby copy promises they stay here, so it ends with the claims area.
  React.useEffect(() => clearSaveVotesPromptLobby, []);
}
