'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { useLocalVotes } from '~/core/state/local-votes';
import { openSaveVotesPrompt } from '~/core/state/save-votes-prompt';

import { tabGroupTabLinkStyles } from '~/design-system/tab-group';

import { hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { ScrollableTabRow } from '../matchmaking/scrollable-tab-row';
import { LobbyExploreClaims } from './lobby-explore-claims';
import { useIsLobbyGuest } from './lobby-guest-hooks';
import { LobbyRoomClaimsWithHighlights, LobbyRoomVote } from './lobby-highlights';
import type { LobbyPageView } from './lobby-view';

export type LobbyClaimsTab = 'room' | 'explore';

const TABS: { id: LobbyClaimsTab; label: string }[] = [
  { id: 'room', label: 'In this room' },
  { id: 'explore', label: 'Explore' },
];

/** The lobby's claims: "In this room" and "Explore", in the debates hub's tab row. */
export function LobbyClaimsArea({ lobby }: { lobby: LobbyPageView }) {
  const [activeTab, setActiveTab] = React.useState<LobbyClaimsTab>('room');
  useSavePromptOnGuestVote();

  return (
    <section className="flex flex-col gap-3" aria-label="Claims">
      <LobbyRoomVote lobby={lobby} />
      <ScrollableTabRow activeKey={activeTab} analyticsLabelPrefix="Lobby claims" className="gap-4">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            {...hubAnalyticsAttributes(`Lobby ${tab.label} tab`, 'navigate_lobby_claims')}
            aria-current={activeTab === tab.id ? 'true' : undefined}
            data-tab-active={activeTab === tab.id ? 'true' : undefined}
            onClick={() => setActiveTab(tab.id)}
            className={tabGroupTabLinkStyles({ active: activeTab === tab.id })}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="lobby-claims-tab-active-border"
                layout
                initial={false}
                transition={{ duration: 0.2 }}
                className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
              />
            )}
          </button>
        ))}
      </ScrollableTabRow>
      {activeTab === 'room' ? (
        <LobbyRoomClaimsWithHighlights lobby={lobby} onExplore={() => setActiveTab('explore')} />
      ) : (
        <LobbyExploreClaims lobby={lobby} />
      )}
    </section>
  );
}

/**
 * A guest's vote here opens the save sheet at once, which shows the vote and signs them up in
 * place; elsewhere it waits for a second vote. The lobby has no claim card option for it.
 */
function useSavePromptOnGuestVote() {
  const guest = useIsLobbyGuest();
  const count = useLocalVotes().votes.length;
  const seenRef = React.useRef(count);
  React.useEffect(() => {
    const previous = seenRef.current;
    seenRef.current = count;
    if (guest && count > previous) openSaveVotesPrompt('single_claim');
  }, [count, guest]);
}
