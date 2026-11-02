'use client';

import * as React from 'react';

import { createPortal } from 'react-dom';

/**
 * Lobby layout spots that deeper parts draw into, e.g. voice controls rendered in the bottom bar.
 * `speakerStrip` is the phone Claims tab's row of speaker thumbnails (GEO-3399): drawn by the roster,
 * which holds the voice state, into the claims panel, which sits outside it. `shareNotice` is that
 * tab's note of a live screen share (GEO-3507), drawn by the share stage the same way.
 */
export type LobbySlotName = 'controls' | 'notices' | 'speakerStrip' | 'shareNotice';

type LobbySlotTargets = Partial<Record<LobbySlotName, HTMLElement | null>>;

const LobbySlotsContext = React.createContext<LobbySlotTargets>({});

export const LobbySlotsProvider = LobbySlotsContext.Provider;

/** Callback refs for each slot's element, and the targets to provide. */
export function useLobbySlotTargets() {
  const [controls, setControls] = React.useState<HTMLElement | null>(null);
  const [notices, setNotices] = React.useState<HTMLElement | null>(null);
  const [speakerStrip, setSpeakerStrip] = React.useState<HTMLElement | null>(null);
  const [shareNotice, setShareNotice] = React.useState<HTMLElement | null>(null);
  const targets = React.useMemo(
    () => ({ controls, notices, speakerStrip, shareNotice }),
    [controls, notices, speakerStrip, shareNotice]
  );
  return {
    targets,
    controlsRef: setControls,
    noticesRef: setNotices,
    speakerStripRef: setSpeakerStrip,
    shareNoticeRef: setShareNotice,
  };
}

/**
 * Draws `children` into the named slot. Without one (tests, other pages), in place by default; a
 * part that only makes sense in its slot passes `inPlace={false}` and draws nothing instead.
 */
export function LobbySlot({
  name,
  inPlace = true,
  children,
}: {
  name: LobbySlotName;
  inPlace?: boolean;
  children: React.ReactNode;
}) {
  const target = React.useContext(LobbySlotsContext)[name];
  if (target) return createPortal(children, target);
  return inPlace ? <>{children}</> : null;
}

/** Switches a phone lobby to its People tab; null where there are no tabs. */
export const LobbyShowPeopleContext = React.createContext<(() => void) | null>(null);
