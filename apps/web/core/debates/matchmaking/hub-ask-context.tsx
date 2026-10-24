'use client';

import * as React from 'react';

import { type OutgoingAsk, type OutgoingAskState, useOutgoingAsk } from './use-outgoing-ask';

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
const HubAskContext = React.createContext<OutgoingAskState | undefined>(undefined);

/**
 * The one `useOutgoingAsk` of a hub surface. Everything on it — the strip, the Requests row, every
 * card and People row — reads this rather than calling the hook again: each call remembers the
 * previous ask on its own, so two of them would race to decide whether the one that just went had
 * ended (and one pressing Cancel would not stop the other saying nobody took it).
 */
export function HubAskProvider({ children }: { children: React.ReactNode }) {
  const state = useOutgoingAsk();
  return <HubAskContext.Provider value={state}>{children}</HubAskContext.Provider>;
}

/**
 * The open ask, `null` for none, or `undefined` outside a hub surface — where cards keep the
 * behaviour they had before the strip existed.
 */
export function useHubAsk(): OutgoingAsk | null | undefined {
  const state = React.useContext(HubAskContext);
  return state === undefined ? undefined : state.ask;
}

const NO_ASK_STATE: OutgoingAskState = {
  ask: null,
  ended: null,
  cancel: () => {},
  cancelling: false,
  dismissEnded: () => {},
};

/**
 * Everything about the open ask — the ended one, Cancel, dismiss — for the surface's own furniture
 * (the strip, the Requests row). Outside a provider there is nothing to show.
 */
export function useHubAskState(): OutgoingAskState {
  return React.useContext(HubAskContext) ?? NO_ASK_STATE;
}
