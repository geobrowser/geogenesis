'use client';

import { useGeoLogin } from '@geogenesis/auth';
import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { Effect } from 'effect';
import { useSetAtom } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

import { downvoted, trackPrivyAuth, upvoted, voteCast } from '~/core/analytics';
import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { useEntityResponse } from '~/core/hooks/use-entity-vote';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { uuidToHex } from '~/core/id/normalize';
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
  type ResponseKind,
  entityResponderProfilesQueryKey,
  entityRespondersQueryKey,
  entityResponseCountsQueryKey,
  getEntityResponseKind,
  hasUnpublishedClaimResponseKindEdit,
  userEntityResponseQueryKey,
} from '~/core/responses/entity-response';
import { useClaimResponseBatchState } from '~/core/responses/use-claim-response-summaries';
import { useEnqueuePendingAction } from '~/core/state/pending-actions';
import { useQueryEntity } from '~/core/sync/use-store';
import { Profile } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { getChecked } from '~/design-system/checkbox';
import { ChevronDown } from '~/design-system/icons/chevron-down';
import { ChevronUp } from '~/design-system/icons/chevron-up';
import { ThumbDown } from '~/design-system/icons/thumb-down';
import { ThumbUp } from '~/design-system/icons/thumb-up';
import { VoteArrow } from '~/design-system/icons/vote-arrow';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

import { ClaimResponderAvatars } from '~/partials/entity-page/claim-voter-avatars';
import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

const ENTITY_RESPONSE_OBJECT_TYPE = 0;

type ResponseVariant = 'default' | 'thumbs' | 'chevrons';

const CLAIM_TYPE = uuidToHex(CLAIM_TYPE_ID);
const CLAIM_IS_FACTUAL = uuidToHex(CLAIM_IS_FACTUAL_PROPERTY_ID);
const TYPES_PROPERTY = uuidToHex(SystemIds.TYPES_PROPERTY);

type EntityVoteButtonsProps = {
  entityId: string;
  spaceId: string;
  responseKind?: ResponseKind | null;
  claimResponderAvatarsPosition?: 'leading' | 'trailing';
  presentation?: 'inline' | 'debate-vertical' | 'debate-horizontal';
};

export function EntityVoteButtons({
  entityId,
  spaceId,
  responseKind: responseKindOverride,
  claimResponderAvatarsPosition = 'leading',
  presentation = 'inline',
}: EntityVoteButtonsProps) {
  const responseBatch = useClaimResponseBatchState();
  // Deliberately unscoped by space. `store.getEntity` filters `relations` to the space asked for
  // but derives `types` from all of them, so a claim collected into another space — a data block
  // row, a ranking entry — has its Types relation only in the space it was published to. Asking
  // for that other space returned an entity with no Types relation at all, so this read it as a
  // plain entity and drew curation arrows, while `ClaimDebateButton` reads `types` and drew the
  // Debate toggle beside it. One claim, two controls disagreeing about what it was.
  //
  // Space still decides the *kind* of response, just not whether there is one: the checks below
  // and `hasUnpublishedClaimResponseKindEdit` each re-filter to `spaceId` themselves, so widening
  // the query leaves them reading exactly what they read before.
  const { entity, isLoading: isLoadingEntity } = useQueryEntity({
    id: entityId,
    includeDeleted: true,
    enabled: responseKindOverride === undefined,
  });
  const activeRelations = entity?.relations.filter(relation => !relation.isDeleted) ?? [];
  const activeValues = entity?.values.filter(value => !value.isDeleted) ?? [];
  const isClaim =
    activeRelations.some(
      relation => uuidToHex(relation.type.id) === TYPES_PROPERTY && uuidToHex(relation.toEntity.id) === CLAIM_TYPE
    ) ?? false;
  const isFactualClaim =
    isClaim &&
    getChecked(
      activeValues.find(
        v => uuidToHex(v.spaceId) === uuidToHex(spaceId) && uuidToHex(v.property.id) === CLAIM_IS_FACTUAL
      )?.value
    ) === true;
  const inferredResponseKind = getEntityResponseKind({ isClaim, isFactual: isFactualClaim });
  const responseKind = responseKindOverride === undefined ? inferredResponseKind : responseKindOverride;
  const hasUnpublishedResponseKindEdit =
    responseKindOverride === undefined && hasUnpublishedClaimResponseKindEdit(entity, spaceId);
  const queryResponseKind = responseKind ?? 'stance';
  const isResponseKindLoading = responseKindOverride === undefined && isLoadingEntity;
  const variant: ResponseVariant =
    queryResponseKind === 'curation' ? 'default' : queryResponseKind === 'veracity' ? 'chevrons' : 'thumbs';
  const responseCopy = ENTITY_RESPONSE_COPY[queryResponseKind];

  const {
    submitResponse,
    submitResponseAsync,
    optimisticResponse,
    isResponseIndexingDelayed,
    isConnected,
    personalSpaceId,
  } = useEntityResponse({ entityId, spaceId, responseKind });
  const { smartAccount } = useSmartAccount();

  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);
  const setPostOnboardingRedirect = useSetAtom(postOnboardingRedirectAtom);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const enqueuePendingAction = useEnqueuePendingAction();

  // A vote cast before the personal space is ready is queued and replayed by PendingActionsRunner
  // once the space exists (see pending-actions). Keep the optimistic mark on screen until the
  // queued write is replayed, then hand off to the mutation's own optimistic state.
  const voteActionId = `entity-vote:${entityId}:${spaceId}`;
  const [queuedResponse, setQueuedResponse] = React.useState<ActiveResponseDirection | undefined>(undefined);
  React.useEffect(() => {
    if (queuedResponse !== undefined && optimisticResponse !== undefined) setQueuedResponse(undefined);
  }, [queuedResponse, optimisticResponse]);

  // Direction a signed-out user picked before sign-in opened.
  const pendingSignInDirectionRef = React.useRef<ActiveResponseDirection | undefined>(undefined);

  function queueVoteWrite(direction: ActiveResponseDirection) {
    setQueuedResponse(direction);
    enqueuePendingAction({
      id: voteActionId,
      label: 'your vote',
      requires: 'personalSpace',
      run: () => submitResponseAsync(direction).then(() => {}),
    });
  }

  const { login } = useGeoLogin({
    onComplete: args => {
      trackPrivyAuth(args, { auth_flow: 'manual_login' });

      const direction = pendingSignInDirectionRef.current;
      if (direction !== undefined) {
        pendingSignInDirectionRef.current = undefined;
        queueVoteWrite(direction);
      }
    },
  });

  const [respondersOpen, setRespondersOpen] = React.useState(false);

  const { data: responseCounts } = useQuery<{ positive: number; negative: number } | null>({
    queryKey: entityResponseCountsQueryKey(entityId, spaceId, ENTITY_RESPONSE_OBJECT_TYPE, queryResponseKind),
    queryFn: () =>
      Effect.runPromise(getEntityResponseCounts(entityId, spaceId, queryResponseKind, ENTITY_RESPONSE_OBJECT_TYPE)),
    enabled: !responseBatch.managed && !isResponseKindLoading && responseKind !== null,
    staleTime: 30_000,
  });

  const { data: serverResponseDirection } = useQuery({
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

  // A queued (pre-personal-space) vote overrides the mutation's own optimistic state until it is
  // replayed and cleared from the queue, at which point the mutation's state takes over.
  const effectiveOptimistic = queuedResponse !== undefined ? queuedResponse : optimisticResponse;
  const activeResponse = effectiveOptimistic === undefined ? serverResponseDirection : effectiveOptimistic;

  const positiveResponses = BigInt(responseCounts?.positive ?? 0);
  const negativeResponses = BigInt(responseCounts?.negative ?? 0);
  const netScore = positiveResponses - negativeResponses;
  const responseScore = (direction: ActiveResponseDirection | null | undefined) =>
    direction === 'positive' ? 1n : direction === 'negative' ? -1n : 0n;
  const displayScore = netScore + responseScore(activeResponse) - responseScore(serverResponseDirection);

  function openPrivySignIn() {
    // Stay on this page after onboarding instead of bouncing to the explore page.
    const search = searchParams?.toString();
    setPostOnboardingRedirect(`${pathname}${search ? `?${search}` : ''}`);
    setName('');
    setTopicId('');
    setAvatar('');
    setSpaceId('');
    setStep('start');
    login();
  }

  function queueResponse(direction: ActiveResponseDirection) {
    if (!smartAccount) {
      pendingSignInDirectionRef.current = direction;
      openPrivySignIn();
      return;
    }
    queueVoteWrite(direction);
  }

  function handlePositiveResponse() {
    if (!isConnected) {
      queueResponse('positive');
      return;
    }
    if (activeResponse === 'positive') {
      submitResponse('clear', {
        onSuccess: () => {
          voteCast('none', voteProperties('remove', 'up'));
        },
      });
    } else {
      const previousResponse = activeResponse ?? null;
      submitResponse('positive', {
        onSuccess: () => {
          upvoted(
            voteProperties(
              previousResponse === 'negative' ? 'switch' : 'cast',
              previousResponse === 'negative' ? 'down' : undefined
            )
          );
        },
      });
    }
  }

  function handleNegativeResponse() {
    if (!isConnected) {
      queueResponse('negative');
      return;
    }
    if (activeResponse === 'negative') {
      submitResponse('clear', {
        onSuccess: () => {
          voteCast('none', voteProperties('remove', 'down'));
        },
      });
    } else {
      const previousResponse = activeResponse ?? null;
      submitResponse('negative', {
        onSuccess: () => {
          downvoted(
            voteProperties(
              previousResponse === 'positive' ? 'switch' : 'cast',
              previousResponse === 'positive' ? 'up' : undefined
            )
          );
        },
      });
    }
  }

  function voteProperties(action: 'cast' | 'switch' | 'remove', previousDirection?: 'up' | 'down') {
    return {
      vote_action: action,
      previous_vote_direction: previousDirection,
      entity_id: entityId,
      space_id: spaceId,
      object_type: ENTITY_RESPONSE_OBJECT_TYPE,
    };
  }

  const scoreLabel = formatScore(displayScore);

  const positiveActive = activeResponse === 'positive';
  const negativeActive = activeResponse === 'negative';
  // Never block the buttons: when the personal space isn't ready the click queues the vote
  // instead of writing it, so the user is never stopped from acting while it's being created.
  const responseDisabled = false;
  const positiveTitle = !isConnected
    ? smartAccount
      ? 'Vote now — saved until your account is ready'
      : responseCopy.signIn
    : positiveActive
      ? responseCopy.removePositive
      : responseCopy.positiveAction;
  const negativeTitle = !isConnected
    ? smartAccount
      ? 'Vote now — saved until your account is ready'
      : responseCopy.signIn
    : negativeActive
      ? responseCopy.removeNegative
      : responseCopy.negativeAction;

  const totalResponders = (responseCounts?.positive ?? 0) + (responseCounts?.negative ?? 0);

  const optimisticPositiveDelta =
    effectiveOptimistic !== undefined ? (positiveActive ? 1 : 0) - (serverResponseDirection === 'positive' ? 1 : 0) : 0;
  const optimisticNegativeDelta =
    effectiveOptimistic !== undefined ? (negativeActive ? 1 : 0) - (serverResponseDirection === 'negative' ? 1 : 0) : 0;
  const effectivePositive = Math.max(0, (responseCounts?.positive ?? 0) + optimisticPositiveDelta);
  const effectiveNegative = Math.max(0, (responseCounts?.negative ?? 0) + optimisticNegativeDelta);
  const effectiveTotal = effectivePositive + effectiveNegative;
  const percentLabel = effectiveTotal > 0 ? `${Math.round((100 * effectivePositive) / effectiveTotal)}%` : '0%';

  const isClaimVariant = variant !== 'default';
  const displayLabel = isClaimVariant ? percentLabel : scoreLabel;

  const renderResponseIcon = (direction: 'up' | 'down', active: boolean) => {
    if (variant === 'chevrons') {
      return direction === 'up' ? <ChevronUp /> : <ChevronDown />;
    }

    if (variant === 'thumbs') {
      return direction === 'up' ? <ThumbUp filled={active} /> : <ThumbDown filled={active} />;
    }

    return <VoteArrow direction={direction} filled={active} color="grey-03" />;
  };

  const claimResponseButtonColor = (active: boolean) => {
    if (variant === 'chevrons') {
      return active ? 'text-[#2A2B2E]' : 'text-grey-03 hover:text-grey-04';
    }
    return isClaimVariant && (active ? 'text-grey-04' : 'text-grey-03 hover:text-grey-04');
  };

  const claimResponderAvatars = isClaimVariant ? (
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

  if ((responseBatch.managed && !responseBatch.ready) || isResponseKindLoading) {
    return <Skeleton className="h-5 w-16 shrink-0 rounded" />;
  }

  if (hasUnpublishedResponseKindEdit) {
    return (
      <span className="text-metadata text-grey-04" title="Publish the claim type change before responding">
        Publish changes before responding
      </span>
    );
  }

  if (responseKind === null) {
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

  return (
    <div className="flex items-center gap-1 text-metadataMedium text-text">
      {claimResponderAvatarsPosition === 'leading' && claimResponderAvatars ? (
        <span className={cx(claimResponderAvatarsClassName, 'mr-1')}>{claimResponderAvatars}</span>
      ) : null}
      <button
        onClick={handlePositiveResponse}
        disabled={responseDisabled}
        title={positiveTitle}
        className={cx(
          'group/vote flex h-5 w-5 items-center justify-center rounded transition-colors',
          !isClaimVariant && 'translate-y-px',
          claimResponseButtonColor(positiveActive),
          responseDisabled && 'cursor-default opacity-50'
        )}
      >
        {renderResponseIcon('up', positiveActive)}
      </button>
      <Popover.Root open={respondersOpen} onOpenChange={setRespondersOpen}>
        <Popover.Trigger asChild>
          <button
            className="min-w-[2ch] cursor-pointer text-center text-[16px]! leading-5 tabular-nums hover:text-grey-04"
            title={totalResponders > 0 ? responseCopy.viewResponders : undefined}
            disabled={totalResponders === 0}
          >
            {displayLabel}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="center"
            side="bottom"
            sideOffset={8}
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
      <button
        onClick={handleNegativeResponse}
        disabled={responseDisabled}
        title={negativeTitle}
        className={cx(
          'group/vote flex h-5 w-5 items-center justify-center rounded transition-colors',
          !isClaimVariant && 'translate-y-px',
          claimResponseButtonColor(negativeActive),
          responseDisabled && 'cursor-default opacity-50'
        )}
      >
        {renderResponseIcon('down', negativeActive)}
      </button>
      {claimResponderAvatarsPosition === 'trailing' && claimResponderAvatars ? (
        <span className={cx(claimResponderAvatarsClassName, 'ml-1')}>{claimResponderAvatars}</span>
      ) : null}
      {isResponseIndexingDelayed ? (
        <span aria-live="polite" className="ml-1 text-metadata text-grey-04">
          Response submitted. Waiting for confirmation.
        </span>
      ) : null}
    </div>
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
        className="group/vote flex items-center justify-center text-grey-04 transition-colors hover:text-text disabled:cursor-default disabled:opacity-50 aria-pressed:text-ctaPrimary"
      >
        <VoteArrow direction="up" filled={positiveActive} color={positiveActive ? 'ctaPrimary' : undefined} />
      </button>
      <span className="text-metadataMedium text-text tabular-nums">{score}</span>
      <button
        type="button"
        aria-label={negativeTitle}
        aria-pressed={negativeActive}
        disabled={disabled}
        title={negativeTitle}
        onClick={onNegative}
        className="group/vote flex items-center justify-center text-grey-04 transition-colors hover:text-text disabled:cursor-default disabled:opacity-50 aria-pressed:text-red-01"
      >
        <VoteArrow direction="down" filled={negativeActive} color={negativeActive ? 'red-01' : undefined} />
      </button>
    </div>
  );
}

type ResponderWithProfile = EntityResponder & { profile: Profile };

function RespondersPopoverContent({
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
  const responseBatch = useClaimResponseBatchState();
  const copy = ENTITY_RESPONSE_COPY[responseKind];
  const respondersQueryKey = entityRespondersQueryKey(entityId, spaceId, objectType, responseKind);
  const { data: responders, isLoading: isLoadingResponders } = useQuery({
    queryKey: respondersQueryKey,
    queryFn: () => Effect.runPromise(getEntityResponders(entityId, spaceId, responseKind, objectType)),
    enabled: !responseBatch.managed,
    staleTime: 30_000,
  });
  const responderSpaceIds = React.useMemo(() => responders?.map(responder => responder.userId) ?? [], [responders]);
  const { data: profiles, isLoading: isLoadingProfiles } = useQuery({
    queryKey: [...entityResponderProfilesQueryKey(entityId, spaceId, objectType, responseKind), responderSpaceIds],
    enabled: !responseBatch.managed && responderSpaceIds.length > 0,
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
    <div className="max-h-[356px] overflow-y-auto">
      {positiveResponders.length > 0 && (
        <ResponderSection label={copy.positiveSection} responders={positiveResponders} />
      )}
      {negativeResponders.length > 0 && (
        <ResponderSection label={copy.negativeSection} responders={negativeResponders} />
      )}
    </div>
  );
}

function ResponderSection({ label, responders }: { label: string; responders: ResponderWithProfile[] }) {
  return (
    <div>
      <div className="px-3 pt-2.5 pb-1.5 text-footnoteMedium text-grey-04">{label}</div>
      {responders.map(v => (
        <VoterRow key={v.userId} profile={v.profile} />
      ))}
    </div>
  );
}

function VoterRow({ profile }: { profile: Profile }) {
  const content = (
    <div className="flex items-center gap-2 px-3 py-1.5 transition-colors duration-75 hover:bg-grey-01">
      <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full">
        <Avatar avatarUrl={profile.avatarUrl} value={profile.address} />
      </div>
      <span className="truncate text-metadataMedium text-text">{profile.name ?? truncateAddress(profile.address)}</span>
    </div>
  );

  if (profile.profileLink) {
    return <Link href={profile.profileLink}>{content}</Link>;
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
