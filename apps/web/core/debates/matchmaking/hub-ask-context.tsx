'use client';

import * as React from 'react';

import { type OutgoingAsk, useOutgoingAsk } from './use-outgoing-ask';

/**
 * The viewer's open ask, handed down to the claim cards of whichever hub surface is showing them
 * (GEO-3463). A context rather than each card calling `useOutgoingAsk`, for two reasons:
 *
 * - The card is drawn on many surfaces that are not the hub — the claim page, the lobby, the debate
 *   ticker — and none of those has a strip to say a request is out or a Cancel to take it back. Only
 *   a surface that mounts the provider turns its cards' Debate now into "Requesting · m:ss".
 * - Each `useOutgoingAsk` keeps its own "ended" bookkeeping and its own mutations; a list of forty
 *   cards would run forty copies of a question with one answer.
 */
const HubAskContext = React.createContext<OutgoingAsk | null | undefined>(undefined);

export function HubAskProvider({ children }: { children: React.ReactNode }) {
  const { ask } = useOutgoingAsk();
  return <HubAskContext.Provider value={ask}>{children}</HubAskContext.Provider>;
}

/**
 * The open ask, `null` for none, or `undefined` outside a hub surface — where cards keep the
 * behaviour they had before the strip existed.
 */
export function useHubAsk(): OutgoingAsk | null | undefined {
  return React.useContext(HubAskContext);
}
