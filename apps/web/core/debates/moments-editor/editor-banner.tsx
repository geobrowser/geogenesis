'use client';

import * as React from 'react';

import { PILL_CLASS, WarnIcon } from './editor-ui';
import type { ReelJob } from './reel-status';

type Failed = Extract<ReelJob, { kind: 'failed' }>;

/** What the red banner says and offers; see {@link bannerFor} for which one wins. */
export type EditorBannerView = {
  lead: string | null;
  text: string;
  /** Problems the worker listed, one line each after the text. */
  more?: readonly string[];
  /** The flagged clips, as numbered now: a "See clip N." link selects the first. */
  see?: readonly number[];
  action?: 'unlock' | 'discard' | 'restore';
};

/** Brings back the clips of a publish that failed after its visit ended. New copy (GEO-3742). */
export const RESTORE_FAILED_EDIT_LABEL = 'Bring back the edit that failed';

type BannerInput = {
  queueError: string | null;
  /** This visit's publish or return to automatic, failed. */
  failed: Failed | null;
  /**
   * A publish that failed after its visit ended (GEO-3742: the popup's tab closed with Done while it
   * rendered), shown as if this visit had sent it.
   */
  failedElsewhere?: Failed | null;
  /** Its clips are on the player's clock and the editor is free to take them back as an edit. */
  canRestore?: boolean;
  flagged: readonly number[];
  reapplyFailed: Failed | null;
  unlinkable: boolean;
  carried: boolean;
  readOnlyReason: string | null;
  wholeReelProblems: readonly string[];
  dirty: boolean;
  inFlight: boolean;
  canUnlock: boolean;
};

/**
 * The one red line above the reel (GEO-3773). At most one shows, in this order: the request
 * couldn't be queued; this visit's publish failed; the debate has no reel; a carried reel; a
 * re-render couldn't keep the hand-picked reel; any other reason the reel can't be edited; a
 * problem with the whole reel. A re-render's failure under the first two lists what the worker
 * found: the way out is the state's own (a read-only carried reel can't be picked again as it is).
 */
export function bannerFor(input: BannerInput): EditorBannerView | null {
  // A refused request says why, keeping the way out of the state under it (Discard, say).
  if (input.queueError) {
    const under = stateBanner(input);
    return { lead: null, text: input.queueError, ...(under?.action && { action: under.action }) };
  }
  return stateBanner(input);
}

function stateBanner({
  failed,
  failedElsewhere = null,
  canRestore = false,
  flagged,
  reapplyFailed,
  unlinkable,
  carried,
  readOnlyReason,
  wholeReelProblems,
  dirty,
  inFlight,
  canUnlock,
}: BannerInput): EditorBannerView | null {
  // A failed publish beats the read-only reason below, so the reason rides along as its last line:
  // without it a read-only editor says nothing of why it can't be edited (or the edit brought back).
  const blocked = readOnlyReason ? [readOnlyReason] : [];
  if (failed) {
    return { lead: 'Nothing changed.', text: failed.summary, more: [...failed.other, ...blocked], see: flagged };
  }
  if (failedElsewhere) {
    return {
      lead: 'Nothing changed.',
      text: failedElsewhere.summary,
      more: [...workerLines(failedElsewhere, 'Clip'), ...blocked],
      ...(canRestore && { action: 'restore' as const }),
    };
  }
  if (unlinkable) {
    const lead = 'This debate has no reel.';
    if (inFlight) {
      return {
        lead,
        text: 'A request for it is in the queue. You can pick clips or return to automatic once it’s done.',
      };
    }
    if (dirty) {
      return {
        lead,
        text: 'Publish the clips you’ve picked, or discard them to return to automatic.',
        action: 'discard',
      };
    }
    // Neither way out can be taken (the transcript never loaded, say): the reason is the way out.
    if (readOnlyReason) return { lead, text: readOnlyReason };
    return {
      lead,
      text: 'A re-render couldn’t carry the hand-picked reel over. Pick new clips, or return to automatic.',
      ...(canUnlock && { action: 'unlock' as const }),
      ...(reapplyFailed && { more: workerLines(reapplyFailed, 'Lost reel, clip') }),
    };
  }
  if (carried) {
    const lead = 'This reel can’t be edited.';
    if (inFlight) {
      return {
        lead,
        text: 'A re-render carried it over and a request to cut it again is in the queue. This page updates when it’s done.',
      };
    }
    if (dirty) {
      return {
        lead,
        text: 'A re-render carried it over and its clips are still cut on the old video. Discard your changes, then return it to automatic.',
        action: 'discard',
      };
    }
    return {
      lead,
      text: 'A re-render carried it over and its clips are still cut on the old video. Return it to automatic to pick again.',
      ...(canUnlock && { action: 'unlock' as const }),
      ...(reapplyFailed && { more: workerLines(reapplyFailed, 'Clip') }),
    };
  }
  if (reapplyFailed) {
    return {
      lead: 'A re-render couldn’t keep this hand-picked reel.',
      text: reapplyFailed.summary,
      more: workerLines(reapplyFailed, 'Clip'),
    };
  }
  if (readOnlyReason) return { lead: null, text: readOnlyReason };
  if (wholeReelProblems.length > 0) return { lead: null, text: wholeReelProblems.join(' ') };
  return null;
}

/** The worker's problems with a reel it re-submitted, clip by clip as that reel stood. */
function workerLines(job: Failed, clipLabel: string) {
  return [
    ...Object.entries(job.clips).flatMap(([at, found]) =>
      found.map(problem => `${clipLabel} ${Number(at) + 1}: ${problem}`)
    ),
    ...job.other,
  ];
}

export function EditorBanner({
  banner,
  onSee,
  onUnlock,
  onDiscard,
  onRestore,
}: {
  banner: EditorBannerView;
  onSee: (clip: number) => void;
  onUnlock: () => void;
  onDiscard: () => void;
  onRestore?: () => void;
}) {
  const see = banner.see ?? [];
  return (
    <div
      role="alert"
      className="flex min-h-11 flex-none items-center gap-2.5 rounded-lg bg-red-02 py-2 pr-2 pl-3 text-metadata"
    >
      <WarnIcon className="text-red-01" />
      <span className="min-w-0 flex-1">
        {banner.lead ? <b className="font-medium">{banner.lead}</b> : null} {banner.text}
        {see.length > 0 ? (
          <>
            {' '}
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 text-inherit underline"
              onClick={() => onSee(see[0])}
            >
              See clip{see.length > 1 ? 's' : ''} {see.join(', ')}.
            </button>
          </>
        ) : null}
        {(banner.more ?? []).map(line => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </span>
      {banner.action ? (
        <button
          type="button"
          className={PILL_CLASS}
          onClick={banner.action === 'unlock' ? onUnlock : banner.action === 'restore' ? onRestore : onDiscard}
        >
          {banner.action === 'unlock'
            ? 'Return to automatic'
            : banner.action === 'restore'
              ? RESTORE_FAILED_EDIT_LABEL
              : 'Discard changes'}
        </button>
      ) : null}
    </div>
  );
}
