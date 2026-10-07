'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { tabGroupTabLinkStyles } from '~/design-system/tab-group';

import type { DebateLobbyView } from '../api';
import { hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { ScrollableTabRow } from '../matchmaking/scrollable-tab-row';
import { LobbyExploreClaims } from './lobby-explore-claims';
import { LobbyRoomClaims } from './lobby-room-claims';

export type LobbyClaimsTab = 'room' | 'explore';

const TABS: { id: LobbyClaimsTab; label: string }[] = [
  { id: 'room', label: 'In this room' },
  { id: 'explore', label: 'Explore' },
];

/** The lobby's claims: "In this room" and "Explore", in the debates hub's tab row. */
export function LobbyClaimsArea({ lobby }: { lobby: DebateLobbyView }) {
  const [activeTab, setActiveTab] = React.useState<LobbyClaimsTab>('room');

  return (
    <section className="flex flex-col gap-3" aria-label="Claims">
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
      {activeTab === 'room' ? <LobbyRoomClaims lobby={lobby} /> : <LobbyExploreClaims lobby={lobby} />}
    </section>
  );
}
