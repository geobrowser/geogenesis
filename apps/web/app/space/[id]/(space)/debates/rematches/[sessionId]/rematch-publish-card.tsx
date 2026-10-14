'use client';

import * as React from 'react';

import type { Debate } from '~/core/debates/api';
import { DebateNotice } from '~/core/debates/debate-notice';
import { CameraIcon } from '~/core/debates/debate-room-controls';
import { DebateUploadProgressBar } from '~/core/debates/debate-upload-progress-bar';
import { useServerClock } from '~/core/debates/matchmaking/use-request-countdown';
import { isWatchableDebate } from '~/core/debates/playback-utils';
import { debateThankYouDeadlineMs } from '~/core/debates/thank-you-period';
import {
  type PublishOptOutOffer,
  usePublishOptOutOffer,
  useSetPublishOptOutRequest,
  useSetThankingDebate,
} from '~/core/debates/thanking-debate-store';

import { PILL_BUTTON_SECONDARY_CLASS_NAME, SmallButton } from '~/design-system/button';
import { Check } from '~/design-system/icons/check';

/**
 * The finished debate's recording, under the pair in the claim picker (GEO-3301).
 *
 * The pair used to sit through a 20 second thank-you screen whose only lasting job was the
 * "Publish debate?" switch. They come straight here now, so the switch comes with them, as a row in
 * the unmute prompt's style (`DebateNotice`): where the recording is, and the way to withdraw it.
 * Once it is published or withdrawn the row says so and can be dismissed.
 *
 * It owns no cancel flow of its own. The upload coordinator does — the confirmation, the request,
 * the local blob — exactly as it did for the switch. This card tells the coordinator which debate
 * the viewer is looking at, reads back what it can offer, and asks it to cancel.
 *
 * Shown for as long as the viewer is in the picker. geo-chat only accepts a cancel until the end of
 * the debate's thank-you period, so past that the card keeps reporting the upload and drops the
 * button rather than offering a cancel that would be refused.
 */
export function RematchPublishCard({
  debate,
  currentUserId,
  opponentName,
}: {
  debate: Debate;
  currentUserId: string;
  /** First name: the row says it inside a sentence. */
  opponentName: string;
}) {
  const offer = usePublishOptOutOffer();
  const setPublishOptOutRequest = useSetPublishOptOutRequest();
  const setThankingDebate = useSetThankingDebate();
  const cancelWindowOpen = useRecordingCancelWindowOpen(debate);
  const [dismissed, setDismissed] = React.useState(false);

  const hasUploadedRecording = debate.recordings.length > 0;
  const recordingCancelled = debate.recording_cancelled_at !== null;
  const state = publishCardState({
    offer,
    recordingCancelled,
    cancelledBy: debate.recording_cancelled_by,
    currentUserId,
    hasUploadedRecording,
    published: isWatchableDebate(debate),
  });
  const visible = state !== null && !dismissed;
  const showsCancel = visible && (state === 'publishing' || state === 'published') && cancelWindowOpen;

  // A layout effect, as the room's is: the banner gives up its own Cancel in the same paint this
  // card draws one, so the two never both show or both hide.
  React.useLayoutEffect(() => {
    setThankingDebate({
      debateId: debate.id,
      // The room saves the recording before it lets the viewer go, so anything of this debate's
      // still on its way out is already in the queue.
      hasPendingLocalRecording: false,
      hasUploadedRecording,
      recordingCancelled,
      showsPublishControl: showsCancel,
      cancelWindowOpen,
    });
  }, [cancelWindowOpen, debate.id, hasUploadedRecording, recordingCancelled, setThankingDebate, showsCancel]);
  React.useLayoutEffect(() => () => setThankingDebate(null), [setThankingDebate]);

  if (!visible) return null;

  const dismiss = state === 'publishing' ? undefined : () => setDismissed(true);

  return (
    <DebateNotice
      data-testid="rematch-publish-card"
      icon={<CameraIcon disabled={false} />}
      onDismiss={dismiss}
      action={
        showsCancel ? (
          <SmallButton
            type="button"
            className={PILL_BUTTON_SECONDARY_CLASS_NAME}
            onClick={() => offer.debateId && setPublishOptOutRequest(offer.debateId)}
            disabled={offer.busy || offer.debateId === null}
          >
            Cancel
          </SmallButton>
        ) : null
      }
    >
      <p role="status">{publishCardLabel(state, opponentName)}</p>
      {state === 'publishing' && (
        <DebateUploadProgressBar label="Upload progress" percent={offer.percent} tone="light" />
      )}
      {state === 'published' && (
        <span className="flex text-green">
          <Check />
        </span>
      )}
    </DebateNotice>
  );
}

type PublishCardState = 'publishing' | 'published' | 'cancelled_by_you' | 'cancelled_by_opponent';

function publishCardLabel(state: PublishCardState, opponentName: string): string {
  switch (state) {
    case 'publishing':
      return 'Publishing your debate';
    case 'published':
      return 'Debate published';
    case 'cancelled_by_you':
      return 'Debate not published';
    case 'cancelled_by_opponent':
      return `${opponentName} cancelled publishing`;
  }
}

/**
 * What the card says, or null for no card. Withdrawn wins over everything: the coordinator knows the
 * moment its own cancel is accepted, the debate row says so once it refetches, and either way the
 * upload behind it is gone.
 *
 * Published only once the debate is: both debaters' recordings on the server, the rule playback
 * itself uses (`isWatchableDebate`). This device finishing its own upload, or the other debater
 * finishing theirs, is still publishing. No recording anywhere means nothing to report and nothing
 * to withdraw.
 */
export function publishCardState({
  offer,
  recordingCancelled,
  cancelledBy,
  currentUserId,
  hasUploadedRecording,
  published,
}: {
  offer: Pick<PublishOptOutOffer, 'cancelled' | 'upload'>;
  recordingCancelled: boolean;
  cancelledBy: string | null;
  currentUserId: string;
  /** Either debater's recording is on the server. */
  hasUploadedRecording: boolean;
  /** Both are: see `isWatchableDebate`. */
  published: boolean;
}): PublishCardState | null {
  if (recordingCancelled || offer.cancelled) {
    return cancelledBy !== null && cancelledBy !== currentUserId ? 'cancelled_by_opponent' : 'cancelled_by_you';
  }
  if (published) return 'published';
  if (offer.upload !== null || hasUploadedRecording) return 'publishing';
  return null;
}

/**
 * Whether geo-chat still accepts a cancel for this debate: through the end of its thank-you period
 * (`debateThankYouDeadlineMs`, the deadline `recording_cancellation_allowed` checks). Read on the
 * server's clock, and flipped by a timer at the deadline so the button goes when the window does
 * rather than on the next unrelated render.
 */
export function useRecordingCancelWindowOpen(
  debate: Pick<Debate, 'status' | 'turn_ends_at' | 'completed_at'>
): boolean {
  const deadlineMs = debateThankYouDeadlineMs(debate);
  const clock = useServerClock(deadlineMs !== null);
  const [open, setOpen] = React.useState(() => deadlineMs !== null && Date.now() <= deadlineMs);

  React.useEffect(() => {
    if (deadlineMs === null) {
      setOpen(false);
      return;
    }
    const remaining = deadlineMs - (clock ? clock.now() : Date.now());
    setOpen(remaining >= 0);
    if (remaining < 0) return;
    const timer = window.setTimeout(() => setOpen(false), remaining + 1);
    return () => window.clearTimeout(timer);
  }, [clock, deadlineMs]);

  return open;
}
