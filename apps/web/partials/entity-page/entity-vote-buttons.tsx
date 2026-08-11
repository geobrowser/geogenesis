'use client';

import { useGeoLogin } from '@geogenesis/auth';
import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { Effect } from 'effect';
import { useSetAtom } from 'jotai';

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
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
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
};

export function EntityVoteButtons({
  entityId,
  spaceId,
  responseKind: responseKindOverride,
  claimResponderAvatarsPosition = 'leading',
}: EntityVoteButtonsProps) {
  const responseBatch = useClaimResponseBatchState();
  const { entity, isLoading: isLoadingEntity } = useQueryEntity({
    id: entityId,
    spaceId,
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

  const { submitResponse, optimisticResponse, isResponseIndexingDelayed, isConnected, personalSpaceId } =
    useEntityResponse({ entityId, spaceId, responseKind });
  const { smartAccount } = useSmartAccount();
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();

  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);

  const { login } = useGeoLogin({
    onComplete: args => trackPrivyAuth(args, { auth_flow: 'manual_login' }),
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

  const activeResponse = optimisticResponse === undefined ? serverResponseDirection : optimisticResponse;

  const positiveResponses = BigInt(responseCounts?.positive ?? 0);
  const negativeResponses = BigInt(responseCounts?.negative ?? 0);
  const netScore = positiveResponses - negativeResponses;
  const responseScore = (direction: ActiveResponseDirection | null | undefined) =>
    direction === 'positive' ? 1n : direction === 'negative' ? -1n : 0n;
  const displayScore = netScore + responseScore(activeResponse) - responseScore(serverResponseDirection);

  function openPrivySignIn() {
    setName('');
    setTopicId('');
    setAvatar('');
    setSpaceId('');
    setStep('start');
    login();
  }

  function handlePositiveResponse() {
    if (!smartAccount) {
      openPrivySignIn();
      return;
    }
    if (!isConnected) return;
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
    if (!smartAccount) {
      openPrivySignIn();
      return;
    }
    if (!isConnected) return;
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

  const totalResponders = (responseCounts?.positive ?? 0) + (responseCounts?.negative ?? 0);

  const optimisticPositiveDelta =
    optimisticResponse !== undefined ? (positiveActive ? 1 : 0) - (serverResponseDirection === 'positive' ? 1 : 0) : 0;
  const optimisticNegativeDelta =
    optimisticResponse !== undefined ? (negativeActive ? 1 : 0) - (serverResponseDirection === 'negative' ? 1 : 0) : 0;
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
      optimisticViewerResponse={optimisticResponse}
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

  return (
    <div className="flex items-center gap-1 text-metadataMedium text-text">
      {claimResponderAvatarsPosition === 'leading' && claimResponderAvatars ? (
        <span className={cx(claimResponderAvatarsClassName, 'mr-1')}>{claimResponderAvatars}</span>
      ) : null}
      <button
        onClick={handlePositiveResponse}
        disabled={!!smartAccount && (!isConnected || isAccountSetupPending)}
        title={
          !smartAccount
            ? responseCopy.signIn
            : isAccountSetupPending
              ? 'Finishing account setup…'
              : isConnected
                ? positiveActive
                  ? responseCopy.removePositive
                  : responseCopy.positiveAction
                : responseCopy.connect
        }
        className={cx(
          'group/vote flex h-5 w-5 items-center justify-center rounded transition-colors',
          !isClaimVariant && 'translate-y-px',
          claimResponseButtonColor(positiveActive),
          !!smartAccount && (!isConnected || isAccountSetupPending) && 'cursor-default opacity-50'
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
        disabled={!!smartAccount && (!isConnected || isAccountSetupPending)}
        title={
          !smartAccount
            ? responseCopy.signIn
            : isAccountSetupPending
              ? 'Finishing account setup…'
              : isConnected
                ? negativeActive
                  ? responseCopy.removeNegative
                  : responseCopy.negativeAction
                : responseCopy.connect
        }
        className={cx(
          'group/vote flex h-5 w-5 items-center justify-center rounded transition-colors',
          !isClaimVariant && 'translate-y-px',
          claimResponseButtonColor(negativeActive),
          !!smartAccount && (!isConnected || isAccountSetupPending) && 'cursor-default opacity-50'
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
