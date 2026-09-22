'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { useMediaQuery } from '~/core/hooks/use-media-query';

import { canSystemShare } from '../system-share';
import { useDebateSystemShare } from './use-debate-system-share';

export type DebateShareControls = {
  /**
   * Whether the Share button opens {@link DebateShareDialog}. False where the OS share sheet owns
   * the button instead, which the host needs to know because a button that opens no dialog must not
   * announce one.
   */
  opensDialog: boolean;
  open: boolean;
  onShare: () => void;
  /** Share is rendering the debate's video and cannot be activated yet. */
  sharePending: boolean;
  /** What the Share control reads while it waits — its progress, where the size is known. */
  shareLabel: string;
  onOpenChange: (open: boolean) => void;
  openerRef: React.RefObject<HTMLElement | null>;
};

/**
 * What a debate's Share button does, which is not the same thing on both layouts.
 *
 * Desktop opens {@link DebateShareDialog} — Reddit, X, LinkedIn, copy link, download. Mobile opens
 * the OS share sheet, as the button did before that dialog landed: on a phone the OS sheet reaches
 * the apps people actually share debates to, which no fixed list of web composers can, and it is
 * already the sheet they expect from every other app. The in-app dialog was only ever meant to
 * replace it on desktop, where there is no OS sheet worth opening.
 *
 * Mobile waits for the debate's social cut and shares the video — see {@link useDebateSystemShare}
 * for what that wait looks like and why it can take a second tap. Either layout falls back to the
 * in-app dialog where the platform has no share sheet, or refuses to open one.
 */
export function useDebateShareAction(debate: Debate | null, spaceId: string): DebateShareControls {
  const [open, setOpen] = React.useState(false);
  const openerRef = React.useRef<HTMLElement | null>(null);
  const isMobileLayout = useIsMobileLayout();
  // Layout width alone is not the question. Desktop Chrome has `navigator.share` too, so a desktop
  // window dragged under 1024px would otherwise swap share surfaces mid-session — and the OS sheet
  // it opens there is the thin one the in-app sheet exists to replace. A coarse pointer is what
  // separates the phone this is meant for from a narrow desktop window.
  const isTouchPointer = useMediaQuery('(pointer: coarse)');
  const usesSystemSheet = isMobileLayout && isTouchPointer && canSystemShare();

  const openDialog = React.useCallback(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);

  const systemShare = useDebateSystemShare(debate, spaceId, { enabled: usesSystemSheet, onRefused: openDialog });

  const onShare = React.useCallback(() => {
    if (!debate) return;
    if (usesSystemSheet) systemShare.onShare();
    else openDialog();
  }, [debate, openDialog, systemShare, usesSystemSheet]);

  const sharePending = systemShare.status === 'preparing';

  return {
    opensDialog: !usesSystemSheet,
    open,
    onShare,
    sharePending,
    shareLabel: sharePending && systemShare.progressPercent !== null ? `${systemShare.progressPercent}%` : 'Share',
    onOpenChange: setOpen,
    openerRef,
  };
}
