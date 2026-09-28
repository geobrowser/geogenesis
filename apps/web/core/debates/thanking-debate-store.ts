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
};

// The debate whose post-debate thank-you screen the user is currently on. The room page also
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
};

const publishOptOutOfferAtom = atom<PublishOptOutOffer>({ debateId: null, busy: false, cancelled: false });

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
