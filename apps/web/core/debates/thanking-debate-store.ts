'use client';

import { atom, useAtomValue, useSetAtom } from 'jotai';

export type ThankingDebate = {
  debateId: string;
  hasPendingLocalRecording: boolean;
  hasUploadedRecording: boolean;
  recordingCancelled: boolean;
  /**
   * The room is showing the thank-you card, which carries the publish control itself.
   *
   * Narrower than `debateId` being set: that also covers the server's thank-you window after the
   * local countdown has run out, when the card is gone and the banner is the only thing left to
   * report an upload. The banner defers to the card only while the card is actually on screen.
   */
  showsPublishControl: boolean;
  /**
   * Whether geo-chat still accepts a cancel for this debate. Absent means open: the room only
   * reports a debate while its thank-you period runs, which is the window itself.
   *
   * The claim picker (GEO-3301) reports the debate for as long as the viewer is in it, which can
   * outlast the window, so it says when the window has closed. The coordinator keeps reporting the
   * upload after that; it only stops offering the cancel.
   */
  cancelWindowOpen?: boolean;
};

// The debate the user has just finished, while they are still on a surface that belongs to it: the
// room's thank-you period, then the claim picker the pair move on to (GEO-3301). That surface also
// carries the authoritative server recording state so the global banner survives a remount after
// IndexedDB's completed upload row has been removed.
const thankingDebateAtom = atom<ThankingDebate | null>(null);

export const useThankingDebate = () => useAtomValue(thankingDebateAtom);

export const useSetThankingDebate = () => useSetAtom(thankingDebateAtom);

/**
 * What the coordinator can currently offer for the thank-you debate, published for the card.
 *
 * The reverse of `thankingDebateAtom`: the room knows what was recorded, the coordinator knows
 * what is still cancellable, and the card in the room needs both to draw one control. `debateId`
 * is null when there is nothing to opt out of — the recording never existed, or the opt-out has
 * already been taken.
 */
export type PublishOptOutOffer = {
  debateId: string | null;
  busy: boolean;
  /**
   * The thank-you debate has been opted out of, and there is no way back.
   *
   * Separate from `debateId` being null, which only says there is nothing to cancel — true of a
   * debate that was never recorded as much as one already withdrawn. The coordinator knows this
   * the moment the server accepts the cancellation, which is well before the room's own debate
   * query has refreshed; the card would otherwise drop the row for the length of that gap, and
   * keep it dropped if the refetch failed.
   */
  cancelled: boolean;
  /**
   * Where the debate's own recording is on its way out, for a surface that reports it beside the
   * cancel (GEO-3301). `preparing` is still being written to this device, `uploading` is in the
   * queue, `uploaded` is out; null when there is no recording here to speak for, or it was
   * withdrawn.
   */
  upload: 'preparing' | 'uploading' | 'uploaded' | null;
  /** That recording's own upload progress, 0-100, or null while nothing is measurable. */
  percent: number | null;
};

export const EMPTY_PUBLISH_OPT_OUT_OFFER: PublishOptOutOffer = {
  debateId: null,
  busy: false,
  cancelled: false,
  upload: null,
  percent: null,
};

const publishOptOutOfferAtom = atom<PublishOptOutOffer>(EMPTY_PUBLISH_OPT_OUT_OFFER);

export const usePublishOptOutOffer = () => useAtomValue(publishOptOutOfferAtom);

export const useSetPublishOptOutOffer = () => useSetAtom(publishOptOutOfferAtom);

/**
 * The viewer has switched publishing off for this debate.
 *
 * A request rather than an action: the coordinator owns the cancel flow — the confirmation, the
 * request, the local blob — and this only says the viewer reached for it. The coordinator clears
 * it once it has taken it up, so the same flick can't be replayed.
 */
const publishOptOutRequestAtom = atom<string | null>(null);

export const usePublishOptOutRequest = () => useAtomValue(publishOptOutRequestAtom);

export const useSetPublishOptOutRequest = () => useSetAtom(publishOptOutRequestAtom);
