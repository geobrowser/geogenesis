'use client';

import * as React from 'react';

import { createPortal } from 'react-dom';

/**
 * Places in the lobby layout that parts deeper in the tree draw into: the voice controls live inside
 * the voice room's provider but show in the bottom bar, and notices stack above it without pushing
 * the page.
 */
export type LobbySlotName = 'controls' | 'notices';

type LobbySlotTargets = Partial<Record<LobbySlotName, HTMLElement | null>>;

const LobbySlotsContext = React.createContext<LobbySlotTargets>({});

export const LobbySlotsProvider = LobbySlotsContext.Provider;

/** Callback refs for each slot's element, and the targets to provide. */
export function useLobbySlotTargets() {
  const [controls, setControls] = React.useState<HTMLElement | null>(null);
  const [notices, setNotices] = React.useState<HTMLElement | null>(null);
  const targets = React.useMemo(() => ({ controls, notices }), [controls, notices]);
  return { targets, controlsRef: setControls, noticesRef: setNotices };
}

/** Draws `children` into the named slot; in place when the layout has none (tests, other pages). */
export function LobbySlot({ name, children }: { name: LobbySlotName; children: React.ReactNode }) {
  const target = React.useContext(LobbySlotsContext)[name];
  return target ? createPortal(children, target) : <>{children}</>;
}
