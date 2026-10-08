'use client';

import { usePrivy } from '@geogenesis/auth';
import * as Popover from '@radix-ui/react-popover';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { Effect } from 'effect';
import { useStore } from 'jotai';

import { withActionContext } from '~/core/action-context';
import { useActionContext } from '~/core/action-context-provider';
import { personProfileOpened } from '~/core/analytics';
import { useEntityResponse } from '~/core/hooks/use-entity-vote';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import {
  type EntityResponder,
  getEntityResponders,
  getEntityResponseCounts,
  getUserEntityResponse,
} from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import {
  type ActiveResponseDirection,
  ENTITY_RESPONSE_COPY,
  RESPONSE_CONFIRMING_COPY,
  RESPONSE_LOCAL_ONLY_COPY,
  type ResponseKind,
  entityResponderProfilesQueryKey,
  entityRespondersQueryKey,
  entityResponseCountsQueryKey,
  hasUnpublishedClaimResponseKindEdit,
  resolveEntityResponseKind,
  userEntityResponseQueryKey,
} from '~/core/responses/entity-response';
import { readViewerResponseForReplay } from '~/core/responses/replay-viewer-response';
import { useClaimResponseBatchState } from '~/core/responses/use-claim-response-summaries';
import { castLocalVote } from '~/core/state/cast-local-vote';
import { removeLocalVote, useLocalVote } from '~/core/state/local-votes';
import { useQueuedAction } from '~/core/state/pending-actions';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { useQueryEntity } from '~/core/sync/use-store';
import { Profile } from '~/core/types';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';

import { Avatar } from '~/design-system/avatar';
import { ResponsePositionIcon } from '~/design-system/icons/response-position-icon';
import { VoteArrow } from '~/design-system/icons/vote-arrow';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { ClaimResponderAvatars } from '~/partials/entity-page/claim-voter-avatars';
import { VOTE_BUTTON_CLASS, VOTE_BUTTON_CONFIRMING_CLASS } from '~/partials/entity-page/vote-button-styles';

import { slideUpPopoverContainerAtom } from '~/atoms';

const ENTITY_RESPONSE_OBJECT_TYPE = 0;

type EntityVoteButtonsProps = {
  entityId: string;
  spaceId: string;
  responseKind?: ResponseKind | null;
  claimResponderAvatarsPosition?: 'leading' | 'trailing';
  presentation?: 'inline' | 'debate-vertical' | 'debate-horizontal';
  /**
   * A surface with no room for prose: the sticky entity header's 48px row.
   *
   * Three of this control's states are sentences rather than controls — the indexing notice beside
   * the buttons, and the two that stand in for the control entirely. Each is wider than a phone can
   * spare next to a name and a set of thumbs: measured at 390px, the indexing notice alone pushed
   * the row 94px past its own width and gave the document a horizontal scrollbar.
   *
   * Dropped rather than truncated, because a sentence cut to "Response s…" tells nobody anything,
   * and dropped rather than wrapped, because the bar is one fixed-height line by design.
   *
   * Two of the three are dropped outright. They describe *state* — that an unpublished type edit is
   * blocking responses, or that there is no response kind — and the page explains that state too, so
   * a reader who finds nothing in the bar has somewhere else to find it.
   *
   * **The indexing notice is not dropped.** It is the only `aria-live` a vote gets, it announces an
   * event the reader just caused, and the vote can be cast from the bar itself. It goes `sr-only`
   * instead: absolutely positioned and clipped, so it takes no width and cannot overflow the row,
   * which is the whole of what `compact` needs from it. Do not "finish the job" by removing it — an
   * earlier version of this comment claimed the page's own copy announced instead, and that is false
   * where it matters most. `ClaimPageView` answers a claim with `ClaimPositionCommentControl`, which
   * puts this same sentence in a `title`: read on focus, never announced.
   *
   * Known and accepted: on surfaces whose page control *is* an `EntityVoteButtons` — generic, topic,
   * profile — both live regions are inserted at once and the confirmation can be announced twice.
   * Deduplicating needs the two surfaces to know about each other, and this component renders once
   * per claim on a list, where a subscription is a cost its own comments already weigh. A duplicate
   * announcement is the better failure than none.
   */
  compact?: boolean;
};

export function EntityVoteButtons({
  entityId,
  spaceId: requestedSpaceId,
  responseKind: responseKindOverride,
  claimResponderAvatarsPosition = 'leading',
  presentation = 'inline',
  compact = false,
}: EntityVoteButtonsProps) {
  const getContext = useActionContext('entity_vote_buttons', 'entity', entityId);
  const responseBatch = useClaimResponseBatchState();
  // Deliberately unscoped by space. `store.getEntity` filters `relations` to the space asked for
  // but derives `types` from all of them, so a claim collected into another space — a data block
  // row, a ranking entry — has its Types relation only in the space it was published to. Asking
  // for that other space returned an entity with no Types relation at all, so this read it as a
  // plain entity and drew curation arrows, while the Debate control beside it read `types` and
  // disagreed about what the same claim was. That control is gone (GEO-2740); the unscoped read
  // stays, because the disagreement it fixed was about this component's own arrows.
  //
  // Space still decides the *kind* of response, just not whether there is one: the checks below
  // and `hasUnpublishedClaimResponseKindEdit` each re-filter to `spaceId` themselves, so widening
  // the query leaves them reading exactly what they read before.
  const { entity, isLoading: isLoadingEntity } = useQueryEntity({
    id: entityId,
    includeDeleted: true,
    enabled: responseKindOverride === undefined,
  });
  // Which space the response belongs to, which is not always the one the caller renders from. An
  // entity collected into a curated page without a pinned target space arrives here as the page's
  // own space, where it holds nothing: the counts came back empty and the percentage read 0%.
  // Resolving it to the space the entity actually lives in is what puts the tally back.
  //
  // Every response kind, not only claims (GEO-2660). A table that lists the top-ranked version of
  // an entity should show that version's votes, so curation follows the same rule as a claim's
  // stance: the arrows belong to whichever space the row is actually showing. This does not re-home
  // curation wholesale — `resolveEntitySpaceId` keeps the requested space whenever the entity holds
  // live content there, so every ordinary row and every entity page are untouched, and only a row
  // listing an entity that lives somewhere else diverts.
  //
  // What it costs: a curation vote cast against a listing space before this reads as the entity
  // holding nothing there — nothing but the Score that vote itself wrote, which residency ignores
  // by design — so that vote is no longer the one displayed. It is still recorded in that space.
  // Auto-join doesn't widen with it: `useEntityVote` excludes curation from `ensureSpaceMembership`.
  const spaceId = resolveEntitySpaceId(entity, requestedSpaceId);
  const inferredResponseKind = resolveEntityResponseKind(entity);
  const responseKind = responseKindOverride === undefined ? inferredResponseKind : responseKindOverride;
  const hasUnpublishedResponseKindEdit =
    responseKindOverride === undefined && hasUnpublishedClaimResponseKindEdit(entity, spaceId);
  const queryResponseKind = responseKind ?? 'stance';
  const isResponseKindLoading = responseKindOverride === undefined && isLoadingEntity;
  const responseCopy = ENTITY_RESPONSE_COPY[queryResponseKind];

  const {
    submitResponse,
    submitResponseAsync,
    optimisticResponse,
    isProcessingResponse,
    isResponseIndexingDelayed,
    isConnected,
    personalSpaceId,
  } = useEntityResponse({ entityId, entityName: entity?.name, spaceId, responseKind });
  const { smartAccount } = useSmartAccount();
  const { ready: authReady, authenticated } = usePrivy();
  // Known to be signed out — not still restoring a session, when `authenticated` reads false too.
  const signedOut = authReady && !authenticated;
  const queryClient = useQueryClient();
  // Signed in without a usable space, a vote is held only when one is on its way: being created for
  // a new account, or still loading for a returning one. With neither, nothing would ever publish it,
  // and drawing it as cast would be a vote that silently never lands.
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();
  const { isLoading: isPersonalSpaceLoading } = usePersonalSpaceId();
  const spaceOnTheWay = isAccountSetupPending || isPersonalSpaceLoading;

  // Queued at the press (below), not on completion: the completion callback belongs to this
  // control, which can unmount mid-sign-up and take the vote with it.
  const promptSignIn = usePrivySignIn();

  const { data: responseCounts } = useQuery<{ positive: number; negative: number } | null>({
    queryKey: entityResponseCountsQueryKey(entityId, spaceId, ENTITY_RESPONSE_OBJECT_TYPE, queryResponseKind),
    queryFn: () =>
      Effect.runPromise(getEntityResponseCounts(entityId, spaceId, queryResponseKind, ENTITY_RESPONSE_OBJECT_TYPE)),
    enabled: !responseBatch.managed && !isResponseKindLoading && responseKind !== null,
    staleTime: 30_000,
  });

  const { data: serverResponseDirection, isSuccess: hasServerResponseAnswered } = useQuery({
    queryKey: userEntityResponseQueryKey(
      personalSpaceId,
      entityId,
      spaceId,
      ENTITY_RESPONSE_OBJECT_TYPE,
      queryResponseKind
    ),
    queryFn: async () => {
      if (!personalSpaceId) return null;
      return Effect.runPromise(
        getUserEntityResponse(personalSpaceId, entityId, spaceId, queryResponseKind, ENTITY_RESPONSE_OBJECT_TYPE)
      );
    },
    enabled: !responseBatch.managed && !!personalSpaceId && !isResponseKindLoading && responseKind !== null,
    staleTime: 30_000,
  });

  // A vote cast before the personal space is ready is queued and replayed by PendingActionsRunner
  // once the space exists (see pending-actions). The queued side is drawn from the queue, not held
  // here, so it survives this control remounting while the viewer signs up; once the write starts
  // the mutation's own optimistic state takes over.
  //
  // Replayed through whichever control is mounted now (`useQueuedAction`): its response hook knows
  // the personal space, and keys the in-flight state this control draws by it.
  const queuedVote = useQueuedAction({
    id: `entity-vote:${entityId}:${spaceId}`,
    component: 'entity_vote_buttons',
    label: 'your vote',
    // Held until the viewer's own side is known: right after sign-in it is still loading, and its
    // empty default would read as "holds nothing" — publishing a side they already hold.
    ready: Boolean(personalSpaceId) && (responseBatch.managed ? responseBatch.ready : hasServerResponseAnswered),
    run: async (intent, { live, isCurrent }) => {
      const direction = intent === 'negative' ? 'negative' : 'positive';
      // The side the viewer holds: this control's answer when it is the one on screen; read fresh
      // when the replay is the press's own closure, whose answer is from before they signed in.
      const held = live
        ? serverResponseDirection
        : await readViewerResponseForReplay(queryClient, {
            entityId,
            spaceId,
            responseKind: queryResponseKind,
            objectType: ENTITY_RESPONSE_OBJECT_TYPE,
          });
      // Cleared (a sign-out) or replaced (a newer press) during that read: the write must not follow.
      if (!isCurrent()) return;
      // A returning viewer who already held this side: nothing to publish.
      if (held === direction) return;
      await submitResponseAsync(direction);
    },
  });
  const queuedResponse: ActiveResponseDirection | undefined =
    queuedVote.intent === 'positive' || queuedVote.intent === 'negative' ? queuedVote.intent : undefined;
  const queueVoteWrite = (direction: ActiveResponseDirection) => queuedVote.queue(direction);

  // A queued (pre-personal-space) vote overrides the mutation's own optimistic state until it is
  // replayed and cleared from the queue, at which point the mutation's state takes over.
  const effectiveOptimistic = queuedResponse !== undefined ? queuedResponse : optimisticResponse;
  const activeResponse = effectiveOptimistic === undefined ? serverResponseDirection : effectiveOptimistic;
  // A vote cast signed out and kept on this device until a save publishes it (GEO-3214). Drawn as the
  // viewer's — the arrow fills — but left out of the score and the split: it doesn't count until it
  // is saved, and the counts say so by not moving. `activeResponse` stays the counted side.
  const localDirection = useLocalVote(entityId, spaceId, responseKind);
  const drawnResponse = effectiveOptimistic === undefined && localDirection !== null ? localDirection : activeResponse;

  const positiveResponses = BigInt(responseCounts?.positive ?? 0);
  const negativeResponses = BigInt(responseCounts?.negative ?? 0);
  const netScore = positiveResponses - negativeResponses;
  const responseScore = (direction: ActiveResponseDirection | null | undefined) =>
    direction === 'positive' ? 1n : direction === 'negative' ? -1n : 0n;
  const displayScore = netScore + responseScore(activeResponse) - responseScore(serverResponseDirection);

  function openPrivySignIn(direction: ActiveResponseDirection) {
    const context = getContext();
    const attempt = promptSignIn(
      {
        ...context,
        auth_control: `${responseKind}_${direction}`,
        auth_intent: 'vote',
        auth_continuation: 'queued',
      },
      // A dismissed sign-in withdraws the vote, so walking away never publishes it later.
      { onCancel: queuedVote.cancel }
    );
    withActionContext({ ...context, auth_attempt_id: attempt?.id }, () => queueVoteWrite(direction));
  }

  function queueResponse(direction: ActiveResponseDirection) {
    if (!smartAccount) {
      // Signed out: vote on this device, with no sign-in in the way. The save sheet asks for an
      // account once there are a few. Signed in with the account still loading, the old prompt stays.
      // Still restoring a session, the press is dropped: kept as a visitor's, a returning account's
      // vote would be cleared as somebody else's the moment the session came back.
      if (!authReady) return;
      if (signedOut && responseKind !== null) {
        castLocalVote({
          entityId,
          spaceId,
          responseKind,
          direction,
          title: entity?.name ?? '',
          attribution: getContext(),
        });
        return;
      }
      openPrivySignIn(direction);
      return;
    }
    if (spaceOnTheWay) queueVoteWrite(direction);
  }

  /** A press signed in replaces this entity's device vote rather than being saved over by it. */
  function dropLocalVote() {
    if (localDirection !== null && responseKind !== null) removeLocalVote({ entityId, spaceId, responseKind });
  }

  function handlePositiveResponse() {
    if (!isConnected) {
      queueResponse('positive');
      return;
    }
    dropLocalVote();
    submitResponse(activeResponse === 'positive' ? 'clear' : 'positive');
  }

  function handleNegativeResponse() {
    if (!isConnected) {
      queueResponse('negative');
      return;
    }
    dropLocalVote();
    submitResponse(activeResponse === 'negative' ? 'clear' : 'negative');
  }

  const scoreLabel = formatScore(displayScore);

  const positiveActive = drawnResponse === 'positive';
  const negativeActive = drawnResponse === 'negative';
  // Never block the buttons: when the personal space isn't ready the click queues the vote
  // instead of writing it, so the user is never stopped from acting while it's being created.
  const responseDisabled = false;
  const signedInTitle = spaceOnTheWay
    ? 'Vote now — saved until your account is ready'
    : 'Finish setting up your account to vote';
  const voteTitle = (direction: ActiveResponseDirection) => {
    const active = direction === 'positive' ? positiveActive : negativeActive;
    if (isConnected) {
      if (!active) return direction === 'positive' ? responseCopy.positiveAction : responseCopy.negativeAction;
      return direction === 'positive' ? responseCopy.removePositive : responseCopy.removeNegative;
    }
    if (smartAccount) return signedInTitle;
    // Signed out, a press votes on this device: the arrow does what it says (GEO-3214).
    if (signedOut) {
      if (localDirection === direction) return RESPONSE_LOCAL_ONLY_COPY;
      return direction === 'positive' ? responseCopy.positiveAction : responseCopy.negativeAction;
    }
    return responseCopy.signIn;
  };
  const positiveTitle = voteTitle('positive');
  const negativeTitle = voteTitle('negative');

  const totalResponders = (responseCounts?.positive ?? 0) + (responseCounts?.negative ?? 0);

  const optimisticPositiveDelta =
    effectiveOptimistic !== undefined
      ? (activeResponse === 'positive' ? 1 : 0) - (serverResponseDirection === 'positive' ? 1 : 0)
      : 0;
  const optimisticNegativeDelta =
    effectiveOptimistic !== undefined
      ? (activeResponse === 'negative' ? 1 : 0) - (serverResponseDirection === 'negative' ? 1 : 0)
      : 0;
  const effectivePositive = Math.max(0, (responseCounts?.positive ?? 0) + optimisticPositiveDelta);
  const effectiveNegative = Math.max(0, (responseCounts?.negative ?? 0) + optimisticNegativeDelta);
  const effectiveTotal = effectivePositive + effectiveNegative;
  const percentLabel = effectiveTotal > 0 ? `${Math.round((100 * effectivePositive) / effectiveTotal)}%` : '0%';

  // A claim shows how the room split; everything else shows a score. This used to ask a `variant`
  // that was itself computed from nothing but the response kind — a second vocabulary parallel to
  // `ResponseKind`, which had to be kept in step by hand. Asking the kind directly removes the
  // thing that could fall out of step.
  const isClaimResponse = queryResponseKind !== 'curation';
  const displayLabel = isClaimResponse ? percentLabel : scoreLabel;

  // Grey whichever side is held; the filled icon says which one you picked. The thumbs used to rest
  // lighter and darken when picked, and curation got no class at all, pinning its arrows' colour on
  // the icon instead — three spellings of a control that should look the same everywhere. See
  // `vote-button-styles` for why the shade is `grey-04` rather than the lighter `grey-03`.
  //
  // Every response kind takes the same class now, held or not. The exception was the veracity
  // chevron, which had no filled form and so needed colour to say it was held; there are no
  // chevrons here any more, so this is no longer a choice and `VOTE_BUTTON_CLASS` is used directly.

  const claimResponderAvatars = isClaimResponse ? (
    <ClaimResponderAvatars
      entityId={entityId}
      spaceId={spaceId}
      objectType={ENTITY_RESPONSE_OBJECT_TYPE}
      responseKind={queryResponseKind}
      totalResponders={effectiveTotal}
      viewerSpaceId={personalSpaceId}
      optimisticViewerResponse={effectiveOptimistic}
    />
  ) : null;

  const claimResponderAvatarsClassName = 'inline-flex h-5 shrink-0 items-center';

  /**
   * The faces, wrapped in their own trigger for the responder list.
   *
   * Gated on `totalResponders` — the served counts — rather than on `effectiveTotal`, which carries
   * the viewer's own unconfirmed vote. The list this opens reads the served responders, so on the
   * optimistic count a viewer's first vote made their own face open a popover reporting that nobody
   * has responded. It is the same gate the tally beside it is disabled by, which is the point: the
   * two open one list and have no business disagreeing about whether there is one.
   *
   * `ClaimResponderAvatars` also draws nothing until the responder rows arrive, and a trigger around
   * nothing is an invisible tab stop with a tooltip; `empty:hidden` covers that gap.
   */
  const claimResponderAvatarsTrigger = (position: 'leading' | 'trailing') => {
    if (!claimResponderAvatars) return null;

    const spacing = position === 'leading' ? 'mr-1' : 'ml-1';

    if (totalResponders === 0) {
      return <span className={cx(claimResponderAvatarsClassName, spacing)}>{claimResponderAvatars}</span>;
    }

    return (
      <RespondersPopover
        entityId={entityId}
        spaceId={spaceId}
        responseKind={queryResponseKind}
        align={position === 'leading' ? 'start' : 'end'}
      >
        <button
          type="button"
          title={responseCopy.viewResponders}
          aria-label={responseCopy.viewResponders}
          className={cx(claimResponderAvatarsClassName, spacing, 'cursor-pointer rounded empty:hidden')}
        >
          {claimResponderAvatars}
        </button>
      </RespondersPopover>
    );
  };

  if ((responseBatch.managed && !responseBatch.ready) || isResponseKindLoading) {
    return <Skeleton className="h-5 w-16 shrink-0 rounded" />;
  }

  if (hasUnpublishedResponseKindEdit) {
    if (compact) return null;
    return (
      <span className="text-metadata text-grey-04" title="Publish the claim type change before responding">
        Publish changes before responding
      </span>
    );
  }

  if (responseKind === null) {
    if (compact) return null;
    return (
      <span className="text-metadata text-grey-04" title="The response type is unavailable">
        Response unavailable
      </span>
    );
  }

  if (presentation !== 'inline') {
    return (
      <DebateVotePill
        orientation={presentation === 'debate-vertical' ? 'vertical' : 'horizontal'}
        score={scoreLabel}
        positiveActive={positiveActive}
        negativeActive={negativeActive}
        disabled={responseDisabled}
        positiveTitle={positiveTitle}
        negativeTitle={negativeTitle}
        onPositive={handlePositiveResponse}
        onNegative={handleNegativeResponse}
      />
    );
  }

  /*
   * Everything the two thumbs share, so the two cannot drift — and so this control matches the claim
   * pills while a response confirms, which is how they came apart in the first place: #2587 and #2598
   * taught the pills how to behave in that window and nothing tied the thumbs to them.
   *
   * For the tens of seconds a response spends confirming (`isProcessingResponse`, the hook's own
   * account of that window), the pills and now the thumbs:
   *
   * - **ignore presses.** The held thumb is this client's guess until the write lands, and pressing a
   *   held thumb means "remove" — so a second press, or a double-click, published a retraction nobody
   *   asked for mid-confirmation;
   * - say so to assistive technology with `aria-disabled`, and to the pointer with `cursor-progress`;
   * - drop the hover step, since nothing under the pointer is going to happen;
   * - put `RESPONSE_CONFIRMING_COPY` in the tooltip, as the pills' `actionTitle` does;
   * - stay at full strength: `aria-disabled` rather than `disabled`, so the side still reads as taken.
   *
   * Inline only. `DebateVotePill` draws this control in the debate overlay and shares its handlers,
   * so the guard sits on these buttons rather than in `handlePositiveResponse` — widening it to the
   * overlay belongs with unifying the pills and the thumbs into one control.
   */
  const voteButtonProps = (onPress: () => void, title: string) => ({
    onClick: () => {
      if (!isProcessingResponse) onPress();
    },
    disabled: responseDisabled,
    'aria-disabled': isProcessingResponse || undefined,
    title: isProcessingResponse ? RESPONSE_CONFIRMING_COPY : title,
    className: cx(
      'group/vote flex h-5 w-5 items-center justify-center rounded transition-colors',
      isProcessingResponse ? VOTE_BUTTON_CONFIRMING_CLASS : VOTE_BUTTON_CLASS,
      responseDisabled && 'cursor-default opacity-50',
      isProcessingResponse && 'cursor-progress'
    ),
  });

  return (
    <div className="flex items-center gap-1 text-metadataMedium text-text">
      {claimResponderAvatarsPosition === 'leading' ? claimResponderAvatarsTrigger('leading') : null}
      <button {...voteButtonProps(handlePositiveResponse, positiveTitle)}>
        <ResponsePositionIcon responseKind={queryResponseKind} position selected={positiveActive} />
      </button>
      <RespondersPopover entityId={entityId} spaceId={spaceId} responseKind={queryResponseKind}>
        <button
          className="min-w-[2ch] cursor-pointer text-center text-[16px]! leading-5 tabular-nums hover:text-grey-04"
          title={totalResponders > 0 ? responseCopy.viewResponders : undefined}
          disabled={totalResponders === 0}
        >
          {displayLabel}
        </button>
      </RespondersPopover>
      <button {...voteButtonProps(handleNegativeResponse, negativeTitle)}>
        <ResponsePositionIcon responseKind={queryResponseKind} position={false} selected={negativeActive} />
      </button>
      {claimResponderAvatarsPosition === 'trailing' ? claimResponderAvatarsTrigger('trailing') : null}
      {isResponseIndexingDelayed ? (
        // Hidden from layout in the bar, not removed from the page. This is the only `aria-live`
        // confirmation a vote gets, and a vote can be cast from the bar — so dropping the node
        // dropped the announcement with it. `sr-only` is absolutely positioned and clipped, so it
        // takes no width and cannot overflow the row, which is all `compact` ever needed from it.
        //
        // I had claimed the page's own copy still announced. It does not on the surface that matters
        // most: `ClaimPageView` answers a claim with `ClaimPositionCommentControl`, which puts this
        // same sentence in a `title` attribute — read on focus, never announced as a live update.
        <span aria-live="polite" className={cx(compact ? 'sr-only' : 'ml-1 text-metadata text-grey-04')}>
          {RESPONSE_CONFIRMING_COPY}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Who responded, hanging off whichever part of the row was clicked.
 *
 * Both the faces and the tally open it. The faces are the more obvious handle — they are pictures of
 * the people the list names, and readers reach for them first — but only the tally was ever wired
 * up, so the cluster looked like a control and did nothing. `ClaimSideResponders` already opens the
 * same list from the same faces on the claim hero; this brings the row in line with it.
 *
 * A `Popover.Root` per trigger rather than one root with two, which Radix does not support: a second
 * trigger would re-anchor the content and leave the first one's `aria-expanded` lying. Two roots
 * also behave correctly when one is already open — the open list dismisses on the outside
 * pointerdown, and the trigger that was clicked opens its own.
 */
function RespondersPopover({
  entityId,
  spaceId,
  responseKind,
  align = 'center',
  children,
}: {
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind;
  align?: 'start' | 'center' | 'end';
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  // Read rather than subscribed: this renders twice per claim on a list, and a subscription would
  // re-render every one of them whenever a sheet opens or closes — which the batching tests rightly
  // count as work. What keeps a bare read current is that `Popover.Portal` only mounts when the
  // popover opens and opening re-renders whatever holds `open` — so the read has to live *with*
  // that state. It used to sit in `EntityVoteButtons`, which was correct while the open state did
  // too; splitting the tally and the faces into a root each moved the render down here and left the
  // read behind, capturing whatever the container was when the row first drew. A sheet registers its
  // host after the rows inside it mount, so that capture was `null` and the list portalled to
  // `body` — outside the sheet's `RemoveScroll` shard, visible but unscrollable.
  const store = useStore();
  const container = store.get(slideUpPopoverContainerAtom);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          align={align}
          side="bottom"
          sideOffset={8}
          // Kept clear of the fixed navbar, and gone once its trigger is.
          //
          // This list hangs off a row inside a scrolling panel — the debates hub — and it is
          // portalled to a container above everything, so nothing clips it. Scroll the panel and
          // the popover tracked its trigger up over the 44px app header and sat there.
          // `collisionPadding.top` reserves that strip; `hideWhenDetached` retires the popover
          // once the trigger is scrolled out of its own container, rather than leaving it
          // floating over a row it no longer belongs to.
          collisionPadding={{ top: 52, right: 16, bottom: 16, left: 16 }}
          hideWhenDetached
          className="z-100 w-[200px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
        >
          <RespondersPopoverContent
            entityId={entityId}
            spaceId={spaceId}
            objectType={ENTITY_RESPONSE_OBJECT_TYPE}
            responseKind={responseKind}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function DebateVotePill({
  orientation,
  score,
  positiveActive,
  negativeActive,
  disabled,
  positiveTitle,
  negativeTitle,
  onPositive,
  onNegative,
}: {
  orientation: 'vertical' | 'horizontal';
  score: string;
  positiveActive: boolean;
  negativeActive: boolean;
  disabled: boolean;
  positiveTitle: string;
  negativeTitle: string;
  onPositive: () => void;
  onNegative: () => void;
}) {
  return (
    <div
      data-entity-vote-presentation={`debate-${orientation}`}
      className={cx(
        'flex items-center justify-center gap-1.5 rounded-full border border-grey-02 bg-white text-text shadow-light',
        orientation === 'vertical' ? 'w-9 flex-col py-2' : 'h-7 px-2.5'
      )}
    >
      <button
        type="button"
        aria-label={positiveTitle}
        aria-pressed={positiveActive}
        disabled={disabled}
        title={positiveTitle}
        onClick={onPositive}
        className={cx(
          'group/vote flex items-center justify-center transition-colors disabled:cursor-default disabled:opacity-50',
          VOTE_BUTTON_CLASS
        )}
      >
        <VoteArrow direction="up" filled={positiveActive} />
      </button>
      <span className="text-metadataMedium text-text tabular-nums">{score}</span>
      <button
        type="button"
        aria-label={negativeTitle}
        aria-pressed={negativeActive}
        disabled={disabled}
        title={negativeTitle}
        onClick={onNegative}
        className={cx(
          'group/vote flex items-center justify-center transition-colors disabled:cursor-default disabled:opacity-50',
          VOTE_BUTTON_CLASS
        )}
      >
        <VoteArrow direction="down" filled={negativeActive} />
      </button>
    </div>
  );
}

type ResponderWithProfile = EntityResponder & { profile: Profile };

/**
 * Who took which side, sectioned by side.
 *
 * Exported so the claim card's responder cluster opens exactly this list rather than growing a
 * second one. The popover already existed; it was only ever reachable from the bare number between
 * the chevrons, which is a poor target for something worth pressing.
 */
export function RespondersPopoverContent({
  entityId,
  spaceId,
  objectType,
  responseKind,
}: {
  entityId: string;
  spaceId: string;
  objectType: 0 | 1;
  responseKind: ResponseKind;
}) {
  const copy = ENTITY_RESPONSE_COPY[responseKind];
  const interactionSurface = responseKind === 'curation' ? 'entity_vote_list' : 'claim_vote_list';
  const respondersQueryKey = entityRespondersQueryKey(entityId, spaceId, objectType, responseKind);

  // These two ask for themselves, batch or no batch.
  //
  // They used to stand down under a `ClaimResponseBatchBoundary`, on the same reasoning every other
  // read here follows: the batch primes these keys, so asking is waste. The reasoning does not hold
  // *here*, and it produced a wrong answer rather than a slow one. This content is inside a
  // `Popover.Content` at both call sites, so it mounts for one claim when a reader opens the list —
  // never for a page of them — and there is no per-row cost to protect.
  //
  // Meanwhile the profiles are primed by a *second* query that runs after the batch resolves and is
  // not part of the boundary's `ready`. Disabled and unprimed, `profiles` stays undefined while
  // `isLoading` reads false — a disabled query is not loading — so the list rendered its "nobody has
  // responded yet" state over a claim with responders. Permanently, if that metadata query failed.
  //
  // Enabled, the primed cache still answers without a request: the batch writes it with
  // `setQueryData`, which counts as fresh against the same `staleTime`. So the batch keeps every bit
  // of its saving, and the one case it does not cover now fetches instead of lying.
  const { data: responders, isLoading: isLoadingResponders } = useQuery({
    queryKey: respondersQueryKey,
    queryFn: () => Effect.runPromise(getEntityResponders(entityId, spaceId, responseKind, objectType)),
    staleTime: 30_000,
  });
  const responderSpaceIds = React.useMemo(() => responders?.map(responder => responder.userId) ?? [], [responders]);
  const { data: profiles, isLoading: isLoadingProfiles } = useQuery({
    queryKey: [...entityResponderProfilesQueryKey(entityId, spaceId, objectType, responseKind), responderSpaceIds],
    enabled: responderSpaceIds.length > 0,
    queryFn: () => Effect.runPromise(fetchProfilesBySpaceIds(responderSpaceIds)),
    staleTime: 30_000,
  });
  let respondersWithProfiles: ResponderWithProfile[] | undefined;
  if (responders?.length === 0) {
    respondersWithProfiles = [];
  } else if (responders && profiles) {
    respondersWithProfiles = responders.map((responder, index): ResponderWithProfile => ({
      ...responder,
      profile: profiles[index]!,
    }));
  }
  const isLoading = isLoadingResponders || (responderSpaceIds.length > 0 && isLoadingProfiles);

  const positiveResponders = respondersWithProfiles?.filter(v => v.direction === 'positive') ?? [];
  const negativeResponders = respondersWithProfiles?.filter(v => v.direction === 'negative') ?? [];

  if (isLoading) {
    return <div className="px-3 py-4 text-center text-metadataMedium text-grey-04">{copy.loading}</div>;
  }

  if (!respondersWithProfiles || respondersWithProfiles.length === 0) {
    return <div className="px-3 py-4 text-center text-metadataMedium text-grey-04">{copy.empty}</div>;
  }

  return (
    // `overscroll-contain`: without it a wheel past either end of this list chains straight through
    // to whatever is behind — the explore feed, or the hub's own claim list — so scrolling the
    // responders scrolled the page under them. Every other scrolling surface in the design system
    // already contains itself; these two lists were written without it.
    <div className="max-h-[356px] overflow-y-auto overscroll-contain">
      {/* The verb, not the noun. Every control on a claim says Agree and Disagree, so a list that
          heads its sections "Agreements" and "Disagreements" makes the reader translate on arrival
          — and "Verifications"/"Disputes" reads stranger still beside a button marked Verify. */}
      {positiveResponders.length > 0 && (
        <ResponderSection
          label={copy.positiveAction}
          responders={positiveResponders}
          interactionSurface={interactionSurface}
        />
      )}
      {negativeResponders.length > 0 && (
        <ResponderSection
          label={copy.negativeAction}
          responders={negativeResponders}
          interactionSurface={interactionSurface}
        />
      )}
    </div>
  );
}

function ResponderSection({
  label,
  responders,
  interactionSurface,
}: {
  label: string;
  responders: ResponderWithProfile[];
  interactionSurface: 'claim_vote_list' | 'entity_vote_list';
}) {
  return (
    <div>
      <div className="px-3 pt-2.5 pb-1.5 text-footnoteMedium text-grey-04">{label}</div>
      {responders.map(v => (
        <VoterRow key={v.userId} profile={v.profile} interactionSurface={interactionSurface} />
      ))}
    </div>
  );
}

function VoterRow({
  profile,
  interactionSurface,
}: {
  profile: Profile;
  interactionSurface: 'claim_vote_list' | 'entity_vote_list';
}) {
  const content = (
    <div className="flex items-center gap-2 px-3 py-1.5 transition-colors duration-75 hover:bg-grey-01">
      <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full">
        <Avatar avatarUrl={profile.avatarUrl} value={profile.address} />
      </div>
      <span className="truncate text-metadataMedium text-text">{profile.name ?? truncateAddress(profile.address)}</span>
    </div>
  );

  if (profile.profileLink) {
    return (
      <Link
        href={profile.profileLink}
        onClick={() => personProfileOpened(profile.spaceId, profile.id, { interaction_surface: interactionSurface })}
      >
        {content}
      </Link>
    );
  }

  return content;
}

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatScore(score: bigint): string {
  const n = Number(score);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
