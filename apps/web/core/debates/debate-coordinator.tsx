'use client';

import * as React from 'react';

import { usePathname, useRouter } from 'next/navigation';

import { Button } from '~/design-system/button';
import { Upload } from '~/design-system/icons/upload';
import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import { activeDebate, recordingCancelledDebateId } from './activity-state';
import { type DebateSharePrompt } from './api';
import { useClaimResponseIndexedNotifier } from './claim-response-indexed-notifier';
import { useDebatePresence } from './debate-attention';
import { DebateChallengeDialog } from './debate-challenge-dialog';
import { clearEnteringDebate, useEnteringDebateId } from './debate-entry-intent';
import { useDebateGateway } from './debate-gateway';
import { DebateReadyPrompt, DebateRejoinBar } from './debate-ready-prompt';
import {
  useAcceptDebateChallenge,
  useDebateActivity,
  useDebateSharePrompts,
  useGeoChatAuth,
  useHandleDebateSharePrompt,
  useRejectDebateChallenge,
} from './hooks';
import { useDebateRequests } from './matchmaking/hooks';
import { IncomingRequestPopup } from './matchmaking/incoming-request-popup';
import { useUnexpiredRequests } from './matchmaking/use-request-countdown';
import {
  getPreparedSocialVideoHandoffMethod,
  handoffPreparedSocialVideo,
  isAbortError,
  usePreparedSocialVideo,
} from './social-video-share';
import { useCurrentGeoChatUserId } from './use-current-geo-chat-user-id';
import { useScrollLock } from './use-scroll-lock';

export function DebateCoordinator() {
  const router = useRouter();
  const pathname = usePathname();
  const geoChatAuth = useGeoChatAuth();
  // Presence, not attention: being available to debate has to survive looking at another window.
  const debatePresence = useDebatePresence();
  const gateway = useDebateGateway(
    geoChatAuth.ready && geoChatAuth.authenticated,
    geoChatAuth.getPrivyIdentityToken,
    geoChatAuth.accountKey,
    debatePresence
  );
  useClaimResponseIndexedNotifier(
    geoChatAuth.ready && geoChatAuth.authenticated,
    geoChatAuth.getPrivyIdentityToken,
    geoChatAuth.accountKey
  );
  const activityQuery = useDebateActivity();
  const currentUserId = useCurrentGeoChatUserId();
  const activity = activityQuery.data ?? null;
  const debate = activeDebate(activity);
  const reportedChallenge = activity?.challenge?.status === 'pending' ? activity.challenge : null;
  // A challenge expires the way a request does, so the same filter owns both — otherwise the popup
  // keeps prompting for a dead one until activity next refetches.
  const liveChallenges = useUnexpiredRequests(
    React.useMemo(() => (reportedChallenge ? [reportedChallenge] : []), [reportedChallenge])
  );
  const challenge = liveChallenges[0] ?? null;
  const acceptChallenge = useAcceptDebateChallenge();
  const rejectChallenge = useRejectDebateChallenge();
  const challengeError = acceptChallenge.error ?? rejectChallenge.error;
  // "Already in it" has to cover the walk there as well as the arrival. The room is a server
  // segment with no `loading` boundary, so the tab that accepted keeps this page — and this
  // pathname — for the seconds the route takes, while the activity it invalidated on the way out
  // comes straight back reporting the debate.
  const enteringDebateId = useEnteringDebateId();
  const atDebate = Boolean(debate && (pathname.includes(`/debates/${debate.id}`) || debate.id === enteringDebateId));
  // The rematch page walks the viewer into its own converted debate. Activity reports that debate
  // before the session query reports `converted`, so for a beat this coordinator sees a `ready`
  // debate, no rematch, and nobody at it — the exact shape it opens the ready prompt for. It opened
  // it on top of a page that was already navigating, so it flashed up and vanished again without
  // being touched (GEO-2604). Nothing app-wide belongs over that page: it owns its own routing, and
  // whatever it is about to do is more current than activity is.
  const atRematchPage = pathname.includes('/debates/rematches/');
  const activeFlow = Boolean(debate || activity?.rematch || challenge);
  const sharePromptsQuery = useDebateSharePrompts(Boolean(activity) && !activeFlow);
  const queriedSharePrompt =
    activeFlow || sharePromptsQuery.isFetching ? null : (sharePromptsQuery.data?.prompts[0] ?? null);
  const [retainedSharePrompt, setRetainedSharePrompt] = React.useState<DebateSharePrompt | null>(null);
  const [closedSharePromptId, setClosedSharePromptId] = React.useState<string | null>(null);

  // Only fetch the request list once activity says one exists, so idle sessions stay quiet. "Not
  // now" snoozes a request for this session; it stays in the hub's Requests tab either way.
  const hasIncomingRequests = (activity?.incoming_request_count ?? 0) > 0;
  const requestsQuery = useDebateRequests(hasIncomingRequests && !activeFlow);
  const [snoozedRequestIds, setSnoozedRequestIds] = React.useState<string[]>([]);
  // Expired requests are dropped here too, so the popup can never prompt for a dead request while
  // waiting on the server's `debate.requests_changed` event.
  const incomingRequests = useUnexpiredRequests(requestsQuery.data?.incoming ?? []);
  const promptedRequest =
    activeFlow || !currentUserId
      ? null
      : (incomingRequests.find(request => request.status === 'pending' && !snoozedRequestIds.includes(request.id)) ??
        null);

  React.useEffect(() => {
    const liveIds = new Set(incomingRequests.map(request => request.id));
    setSnoozedRequestIds(current => {
      const next = current.filter(id => liveIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [incomingRequests]);

  // The claimless challenge gets the same treatment: "Not now" only closes the popup, and the
  // challenge keeps its place in the hub's Requests tab until it is answered or expires.
  const [snoozedChallengeId, setSnoozedChallengeId] = React.useState<string | null>(null);
  const promptedChallenge = challenge && challenge.id !== snoozedChallengeId ? challenge : null;
  // Only the recipient is prompted. `challenge` itself stays live for everyone, since `activeFlow`
  // above reads it to keep other popups from stacking on top of an outstanding challenge.
  const isChallengeRecipient = promptedChallenge?.recipient.user_id === currentUserId;

  React.useEffect(() => {
    if (snoozedChallengeId && challenge?.id !== snoozedChallengeId) setSnoozedChallengeId(null);
  }, [challenge, snoozedChallengeId]);

  // How the person who *sent* the request learns it was accepted (GEO-2514): the debate exists
  // already, and this is the only thing that tells them. `atDebate` keeps it off the accepting
  // tab's screen, which is walking into the room and does not need telling.
  //
  // There is no snooze here, unlike the request and challenge popups. Those leave something behind
  // that the other side is not waiting on; this one is a debate with an opponent already in the
  // room, so the only two honest answers are to join or to decline — and declining cancels it for
  // both of them. Dismissing it locally stranded the opponent in the ready screen.
  //
  // The dialog names both sides, so it needs both. Deciding that here rather than letting the
  // dialog render nothing keeps the rejoin bar as the fallback — otherwise a debate reported
  // without its participants would offer no way in at all.
  //
  // Only while it is still `ready`, for the same reason declining cancels: past that point there is
  // nothing to decline. Aborting an `in_progress` debate ends a room the pair is recording in, and
  // aborting a `thanking` one throws away a recording that is finished but not yet published. This
  // coordinator is mounted app-wide, so a second tab opened on any other Geo page would put that
  // button in front of someone mid-debate, in a dialog that covers the page and has no other way
  // out. Everything past `ready` falls through to the rejoin bar, which offers the way in without
  // offering a way to destroy it.
  const describable = (debate?.participants?.length ?? 0) >= 2;
  const promptedDebate =
    debate && debate.status === 'ready' && describable && !atDebate && !atRematchPage ? debate : null;

  // Held until a navigation commits, then released. Arriving at the room is the expected end, and
  // `atDebate` carries on from the pathname there. Going anywhere else abandons the walk — holding
  // the intent past that would suppress the prompt and the rejoin bar both, which are the only two
  // ways into an unfinished debate, for the rest of the window. The timeout in the store is the
  // backstop for a push that commits nothing at all.
  const entryPathnameRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!enteringDebateId) {
      entryPathnameRef.current = null;
      return;
    }
    if (pathname.includes(`/debates/${enteringDebateId}`)) {
      clearEnteringDebate(enteringDebateId);
      return;
    }
    if (entryPathnameRef.current === null) {
      entryPathnameRef.current = pathname;
      return;
    }
    if (pathname !== entryPathnameRef.current) clearEnteringDebate(enteringDebateId);
  }, [enteringDebateId, pathname]);

  React.useEffect(() => {
    if (!queriedSharePrompt || retainedSharePrompt || queriedSharePrompt.id === closedSharePromptId) return;
    setRetainedSharePrompt(queriedSharePrompt);
  }, [closedSharePromptId, queriedSharePrompt, retainedSharePrompt]);

  React.useEffect(() => {
    if (activeFlow) setRetainedSharePrompt(null);
  }, [activeFlow]);

  React.useEffect(() => {
    if (!activity) return;
    const rematch = activity.rematch;
    if (!rematch) return;
    // A debate whose recording was cancelled cannot be re-entered: the room hides itself and
    // returns whoever opens it. Pushing into it here turned that into a navigation loop — the
    // screen flickered, and the opponent's "your debate was removed" dialog came back after Okay.
    if (rematch.source_debate_id && rematch.source_debate_id === recordingCancelledDebateId(activity)) return;
    const sourceDebatePath = rematch.source_debate_id ? `/debates/${rematch.source_debate_id}` : null;
    if (rematch.status === 'deciding') {
      if (sourceDebatePath && !pathname.includes(sourceDebatePath)) {
        router.push(`/space/${rematch.source_space_id}${sourceDebatePath}`);
      }
      return;
    }
    if (rematch.status === 'browsing' || rematch.status === 'request_pending') {
      // The debate room owns recording finalization before entering the browser.
      if (sourceDebatePath && pathname.includes(sourceDebatePath)) return;
      const path = `/space/${rematch.source_space_id}/debates/rematches/${rematch.id}`;
      if (pathname !== path) router.push(path);
    }
  }, [activity, pathname, router]);

  const visibleSharePrompt =
    retainedSharePrompt ?? (queriedSharePrompt?.id === closedSharePromptId ? null : queriedSharePrompt);

  return (
    <>
      {gateway.paused && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed top-3 left-1/2 z-[1400] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-full bg-text px-4 py-2 text-center text-sm text-white shadow-card sm:w-auto"
        >
          Live debate updates are paused while reconnecting.
        </div>
      )}
      {promptedDebate && currentUserId && !activity?.rematch && (
        <DebateReadyPrompt key={promptedDebate.id} debate={promptedDebate} currentUserId={currentUserId} />
      )}
      {debate && !atDebate && !atRematchPage && !promptedDebate && !activity?.rematch && (
        <DebateRejoinBar debate={debate} />
      )}
      {/* Recipient only: they have a decision to make. The sender's copy waits under Sent in the
          hub's Requests tab, and the rematch routing effect above walks them into the claim picker
          the moment it is accepted. */}
      {promptedChallenge && isChallengeRecipient && !debate && !activity?.rematch && (
        <DebateChallengeDialog
          challenge={promptedChallenge}
          busy={acceptChallenge.isPending || rejectChallenge.isPending}
          error={challengeError instanceof Error ? challengeError.message : null}
          onAccept={() => acceptChallenge.mutate(promptedChallenge.id)}
          onReject={() => rejectChallenge.mutate(promptedChallenge.id)}
          onNotNow={() => setSnoozedChallengeId(promptedChallenge.id)}
        />
      )}
      {promptedRequest && currentUserId && (
        <IncomingRequestPopup
          key={promptedRequest.id}
          request={promptedRequest}
          currentUserId={currentUserId}
          onNotNow={() => setSnoozedRequestIds(current => [...current, promptedRequest.id])}
        />
      )}
      {!activeFlow && !promptedRequest && visibleSharePrompt && (
        <DebateSharePromptDialog
          key={visibleSharePrompt.id}
          prompt={visibleSharePrompt}
          stackCount={sharePromptsQuery.data?.prompts.length ?? 1}
          onClose={() => {
            setClosedSharePromptId(visibleSharePrompt.id);
            setRetainedSharePrompt(null);
          }}
        />
      )}
    </>
  );
}

function DebateSharePromptDialog({
  prompt,
  stackCount,
  onClose,
}: {
  prompt: { id: string; debate_id: string; source_space_id: string; claim: string };
  stackCount: number;
  onClose: () => void;
}) {
  const handlePrompt = useHandleDebateSharePrompt();
  const [shareError, setShareError] = React.useState<string | null>(null);
  const [isSharing, setIsSharing] = React.useState(false);
  const [isUpdatingPrompt, setIsUpdatingPrompt] = React.useState(false);
  const [handoffCompleted, setHandoffCompleted] = React.useState(false);
  const [promptHandled, setPromptHandled] = React.useState(false);
  const sharingRef = React.useRef(false);
  const promptActionRef = React.useRef(false);
  const preparedVideo = usePreparedSocialVideo(prompt.debate_id, { enabled: true, includePreview: true });

  useScrollLock();

  const closeDialog = () => {
    onClose();
  };
  const finishPrompt = (action: 'shared' | 'dismissed', keepOpen = false) => {
    if (promptActionRef.current) return;
    promptActionRef.current = true;
    setIsUpdatingPrompt(true);
    setShareError(null);
    handlePrompt.mutate(
      { promptId: prompt.id, action },
      {
        onSuccess: () => {
          promptActionRef.current = false;
          setIsUpdatingPrompt(false);
          if (action === 'shared') setPromptHandled(true);
          if (!keepOpen) closeDialog();
        },
        onError: () => {
          promptActionRef.current = false;
          setIsUpdatingPrompt(false);
          setShareError(
            action === 'shared'
              ? "The video was handed off, but Geo couldn't finish updating this prompt. Try again."
              : 'Could not dismiss the share prompt. Try again.'
          );
        },
      }
    );
  };
  const dismiss = () => {
    if (promptHandled) {
      closeDialog();
      return;
    }
    finishPrompt(handoffCompleted ? 'shared' : 'dismissed');
  };
  const handoffMethod = React.useMemo(
    () => (preparedVideo.file ? getPreparedSocialVideoHandoffMethod(preparedVideo.file) : null),
    [preparedVideo.file]
  );
  const share = async () => {
    if (handoffCompleted) {
      if (promptHandled) closeDialog();
      else finishPrompt('shared', true);
      return;
    }
    if (!preparedVideo.file || !preparedVideo.downloadUrl) return;
    if (sharingRef.current) return;
    sharingRef.current = true;
    setIsSharing(true);
    setShareError(null);
    try {
      await handoffPreparedSocialVideo({
        debateId: prompt.debate_id,
        title: prompt.claim,
        file: preparedVideo.file,
        downloadUrl: preparedVideo.downloadUrl,
      });
      setHandoffCompleted(true);
      finishPrompt('shared', true);
    } catch (error) {
      if (isAbortError(error)) return;
      setShareError(error instanceof Error ? error.message : 'Could not share the video.');
    } finally {
      sharingRef.current = false;
      setIsSharing(false);
    }
  };
  const shareButtonLabel = isSharing
    ? 'Sharing…'
    : isUpdatingPrompt
      ? 'Finishing…'
      : handoffCompleted
        ? promptHandled
          ? 'Done'
          : 'Finish sharing'
        : preparedVideo.status !== 'ready'
          ? 'Preparing video…'
          : handoffMethod === 'native_share'
            ? 'Share video'
            : 'Download video';

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center overflow-y-auto bg-text/55 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="debate-share-title"
        className="relative w-[min(370px,100%)] rounded-lg bg-bg p-5 shadow-card"
      >
        {stackCount > 1 && (
          <span aria-hidden="true" className="absolute inset-x-4 top-4 -bottom-3 -z-10 rounded-xl bg-grey-02" />
        )}
        {stackCount > 2 && (
          <span aria-hidden="true" className="absolute inset-x-7 top-7 -bottom-6 -z-20 rounded-xl bg-grey-03" />
        )}
        <header className="flex items-start justify-between gap-4">
          <h2 id="debate-share-title" className="text-cardEntityTitle">
            Your debate is ready to share!
          </h2>
          <button
            type="button"
            aria-label="Close share prompt"
            onClick={dismiss}
            disabled={isSharing || isUpdatingPrompt || handlePrompt.isPending}
            className="grid size-9 shrink-0 place-items-center rounded-full text-2xl text-grey-04 hover:bg-grey-02"
          >
            ×
          </button>
        </header>

        <div className="relative mx-auto mt-5 aspect-[9/16] w-full max-w-[270px] overflow-hidden rounded-lg bg-text text-white shadow-card">
          {preparedVideo.playbackUrl ? (
            <video
              src={preparedVideo.playbackUrl}
              poster={preparedVideo.previewUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              aria-label={`Social video for ${prompt.claim}`}
              className="size-full object-contain"
            />
          ) : preparedVideo.previewUrl ? (
            // The preview is extracted from the MP4, so this is the exact social composition.
            <img
              src={preparedVideo.previewUrl}
              alt={`Social video preview for ${prompt.claim}`}
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center bg-purple px-6 text-center">
              <Text color="white">{preparedVideo.previewFailed ? 'Preview unavailable' : 'Loading preview…'}</Text>
            </div>
          )}
        </div>

        {preparedVideo.status === 'preparing' && (
          <div aria-live="polite" className="mt-4">
            <div className="flex items-center justify-center gap-2 text-center">
              <Spinner />
              <Text>
                Preparing video…
                {preparedVideo.progressPercent !== null ? ` ${preparedVideo.progressPercent}%` : ''}
              </Text>
            </div>
            <div
              role="progressbar"
              aria-label="Preparing social video"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={preparedVideo.progressPercent ?? undefined}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-grey-02"
            >
              <div
                className={`h-full rounded-full bg-purple transition-[width] ${
                  preparedVideo.progressPercent === null ? 'w-1/3 animate-pulse' : ''
                }`}
                style={
                  preparedVideo.progressPercent === null ? undefined : { width: `${preparedVideo.progressPercent}%` }
                }
              />
            </div>
          </div>
        )}
        {preparedVideo.error && (
          <div className="mt-3 text-center">
            <Text color="red-01">{preparedVideo.error}</Text>
            <Button type="button" variant="secondary" onClick={preparedVideo.retry} className="mt-2 rounded-full">
              Retry preparation
            </Button>
          </div>
        )}
        {shareError && (
          <Text color="red-01" className="mt-3 text-center">
            {shareError}
          </Text>
        )}
        <div className="mt-5 flex justify-center">
          <Button
            type="button"
            onClick={share}
            disabled={isSharing || isUpdatingPrompt || handlePrompt.isPending || preparedVideo.status !== 'ready'}
            icon={<Upload />}
            className="gap-2 rounded-full"
          >
            {shareButtonLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
