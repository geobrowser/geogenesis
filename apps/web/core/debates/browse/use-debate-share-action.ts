'use client';

import * as React from 'react';

import { capture } from '~/core/analytics';
import type { Debate } from '~/core/debates/api';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { useMediaQuery } from '~/core/hooks/use-media-query';

import { isAbortError, isUnretryableShareError, preparedSocialVideoFile } from '../social-video-share';
import { canSystemShare, shareDebateWithSystemSheet } from '../system-share';
import { debateShareMessage, debateShareUrl } from './share-text';

export type DebateShareControls = {
  /**
   * Whether the Share button opens {@link DebateShareDialog}. False where the OS share sheet owns
   * the button instead, which the host needs to know because a button that opens no dialog must not
   * announce one.
   */
  opensDialog: boolean;
  open: boolean;
  onShare: () => void;
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
 * The OS sheet hands off the social cut when one is already prepared and the debate's link
 * otherwise, and never waits for a video either way — see {@link shareDebateWithSystemSheet}. It
 * also falls back to the in-app dialog when the platform has no share sheet, or refuses to open one.
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
  const opensDialog = !(isMobileLayout && isTouchPointer && canSystemShare());

  const openDialog = React.useCallback(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);

  const onShare = React.useCallback(() => {
    if (!debate) return;
    if (opensDialog) {
      openDialog();
      return;
    }

    const claim = debate.claim.claim;
    let handoff: ReturnType<typeof shareDebateWithSystemSheet>;
    try {
      handoff = shareDebateWithSystemSheet({
        title: claim.trim(),
        text: debateShareMessage(claim),
        url: debateShareUrl(spaceId, debate.id),
        // Whatever is already in memory, never a fetch: see `preparedSocialVideoFile`.
        file: preparedSocialVideoFile(debate.id),
      });
    } catch {
      openDialog();
      return;
    }

    void handoff.shared
      .then(() => {
        // On resolve rather than on click, unlike the dialog's composer hand-offs: the OS sheet is
        // the one surface that tells us whether the share actually happened.
        try {
          capture('debate_share_action', {
            debate_id: debate.id,
            space_id: spaceId,
            method: 'native_share',
            payload: handoff.payload,
          });
        } catch {}
      })
      .catch(error => {
        // They dismissed the sheet. Nothing to report and nothing to fall back to.
        if (isAbortError(error)) return;
        // The browser refused the capability outright, so reopening the same sheet refuses
        // identically. The in-app dialog asks nothing of the platform, so it is the way through.
        if (isUnretryableShareError(error)) openDialog();
      });
  }, [debate, opensDialog, openDialog, spaceId]);

  return {
    opensDialog,
    open,
    onShare,
    onOpenChange: setOpen,
    openerRef,
  };
}
