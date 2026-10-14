'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate } from '~/core/debates/api';
import { useServerClock } from '~/core/debates/matchmaking/use-request-countdown';
import {
  usePublishOptOutOffer,
  useSetPublishOptOutRequest,
  useSetThankingDebate,
} from '~/core/debates/thanking-debate-store';

import { Check } from '~/design-system/icons/check';
import { CloseSmall } from '~/design-system/icons/close-small';

/**
 * The finished debate's recording, under the pair in the claim picker (GEO-3301).
 *
 * The pair used to sit through a 20 second thank-you screen whose only lasting job was the
 * "Publish debate?" switch. They come straight here now, so the switch comes with them, as a card:
 * the debated claim, where its recording is, and the way to withdraw it.
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
  /** First name: the card says it inside a sentence. */
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

  const done = state === 'cancelled_by_you' || state === 'cancelled_by_opponent';

  return (
    <section
      aria-label="Your debate's recording"
      data-testid="rematch-publish-card"
      className={cx(
        'flex flex-col gap-1.5 rounded-lg border p-3',
        done ? 'border-transparent bg-grey-01' : 'border-grey-02 bg-white'
      )}
    >
      <p className="text-metadataMedium text-text">{debate.claim.claim}</p>
      <div className="flex min-h-7 items-center gap-2.5">
        <p role="status" className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-chat text-grey-04">
          {state === 'publishing' && (
            <>
              <span>Publishing your debate</span>
              <PublishProgress percent={offer.percent} />
            </>
          )}
          {state === 'published' && (
            <>
              <span>Debate published</span>
              <span className="text-green">
                <Check />
              </span>
            </>
          )}
          {state === 'cancelled_by_you' && (
            <span>Debate not published. The video was removed for you and {opponentName}.</span>
          )}
          {state === 'cancelled_by_opponent' && (
            <span>{opponentName} cancelled publishing. The video was removed for both of you.</span>
          )}
        </p>
        {showsCancel && (
          <button
            type="button"
            onClick={() => offer.debateId && setPublishOptOutRequest(offer.debateId)}
            disabled={offer.busy || offer.debateId === null}
            className="inline-flex min-h-7 shrink-0 items-center rounded-full border border-grey-02 bg-white px-3 text-metadata text-text transition-colors hover:border-grey-03 disabled:cursor-default disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        {done && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="grid size-7 shrink-0 place-items-center rounded-full text-grey-04 transition-colors hover:text-text"
          >
            <CloseSmall />
          </button>
        )}
      </div>
    </section>
  );
}

type PublishCardState = 'publishing' | 'published' | 'cancelled_by_you' | 'cancelled_by_opponent';

/**
 * What the card says, or null for no card. Withdrawn wins over everything: the coordinator knows the
 * moment its own cancel is accepted, the debate row says so once it refetches, and either way the
 * upload behind it is gone. No recording anywhere means nothing to report and nothing to withdraw.
 */
export function publishCardState({
  offer,
  recordingCancelled,
  cancelledBy,
  currentUserId,
  hasUploadedRecording,
}: {
  offer: { cancelled: boolean; upload: 'preparing' | 'uploading' | 'uploaded' | null };
  recordingCancelled: boolean;
  cancelledBy: string | null;
  currentUserId: string;
  hasUploadedRecording: boolean;
}): PublishCardState | null {
  if (recordingCancelled || offer.cancelled) {
    return cancelledBy !== null && cancelledBy !== currentUserId ? 'cancelled_by_opponent' : 'cancelled_by_you';
  }
  if (offer.upload === 'preparing' || offer.upload === 'uploading') return 'publishing';
  if (offer.upload === 'uploaded' || hasUploadedRecording) return 'published';
  return null;
}

/** The banner's bar, at the card's scale: a fill when the share is known, a pulse while it is not. */
function PublishProgress({ percent }: { percent: number | null }) {
  return (
    <span
      role="progressbar"
      aria-label="Upload progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-grey-02"
    >
      <span
        className={cx(
          'block h-full rounded-full bg-text transition-[width]',
          percent === null && 'w-1/3 animate-pulse'
        )}
        style={percent === null ? undefined : { width: `${percent}%` }}
      />
    </span>
  );
}

/**
 * Whether geo-chat still accepts a cancel for this debate: through the end of its thank-you period,
 * which is `turn_ends_at` once the debate is thanking or complete (`completed_at` when the period
 * never ran). Read on the server's clock, and flipped by a timer at the deadline so the button goes
 * when the window does rather than on the next unrelated render.
 */
export function useRecordingCancelWindowOpen(
  debate: Pick<Debate, 'status' | 'turn_ends_at' | 'completed_at'>
): boolean {
  const ended = debate.status === 'thanking' || debate.status === 'complete';
  const deadlineMs = ended ? Date.parse(debate.turn_ends_at ?? debate.completed_at ?? '') : Number.NaN;
  const clock = useServerClock(Number.isFinite(deadlineMs));
  const read = React.useCallback(() => (clock ? clock.now() : Date.now()), [clock]);
  const [open, setOpen] = React.useState(() => Number.isFinite(deadlineMs) && Date.now() <= deadlineMs);

  React.useEffect(() => {
    if (!Number.isFinite(deadlineMs)) {
      setOpen(false);
      return;
    }
    const remaining = deadlineMs - read();
    setOpen(remaining >= 0);
    if (remaining < 0) return;
    const timer = window.setTimeout(() => setOpen(false), remaining + 1);
    return () => window.clearTimeout(timer);
  }, [deadlineMs, read]);

  return open;
}
