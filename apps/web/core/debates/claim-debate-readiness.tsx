'use client';

import cx from 'classnames';

import { useEntityResponseIndexingState } from '~/core/hooks/use-entity-vote';
import { responsePositionLabel } from '~/core/responses/entity-response';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { DebateClaim, DebateOnlineChoice, DebateResponseKind } from './api';
import { DebateEntityResponseControls } from './debate-entity-response-controls';
import { useJoinDebateQueue, useLeaveDebateQueue } from './hooks';

type ClaimDebateReadinessProps = {
  debateClaim: DebateClaim | null;
  entityId: string;
  spaceId: string;
  canToggle: boolean;
  className?: string;
  textVariant?: 'metadata' | 'body';
};

export function ClaimDebateReadiness({
  debateClaim,
  entityId,
  spaceId,
  canToggle,
  className,
  textVariant = 'metadata',
}: ClaimDebateReadinessProps) {
  if (!debateClaim) return null;

  return (
    <ClaimDebateReadinessContent
      debateClaim={debateClaim}
      entityId={entityId}
      spaceId={spaceId}
      canToggle={canToggle}
      className={className}
      textVariant={textVariant}
    />
  );
}

function ClaimDebateReadinessContent({
  debateClaim,
  entityId,
  spaceId,
  canToggle,
  className,
  textVariant = 'metadata',
}: Omit<ClaimDebateReadinessProps, 'debateClaim'> & { debateClaim: DebateClaim }) {
  const joinQueue = useJoinDebateQueue(spaceId);
  const leaveQueue = useLeaveDebateQueue(spaceId);
  const responseIndexingState = useEntityResponseIndexingState({
    entityId,
    spaceId,
    responseKind: debateClaim.response_kind,
  });

  const isReady = debateClaim.viewer_debate_ready;
  const isResponseProcessing = responseIndexingState !== 'idle';
  const isPending = joinQueue.isPending || leaveQueue.isPending;
  const mutationError =
    joinQueue.error instanceof Error
      ? joinQueue.error.message
      : leaveQueue.error instanceof Error
        ? leaveQueue.error.message
        : null;

  return (
    <div className={className}>
      <OnlineChoices responseKind={debateClaim.response_kind} choices={debateClaim.online_choices} />

      {debateClaim.viewer_response ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Text as="p" variant={textVariant} color="grey-04">
              Your response: {debateClaim.viewer_response.position_label}
            </Text>
            <DebateEntityResponseControls
              entityId={entityId}
              spaceId={spaceId}
              responseKind={debateClaim.response_kind}
            />
          </div>
          <button
            type="button"
            aria-pressed={isReady}
            onClick={() =>
              isReady ? leaveQueue.mutate({ claimId: entityId }) : joinQueue.mutate({ claimId: entityId })
            }
            disabled={isPending || isResponseProcessing || (!isReady && !canToggle)}
            className={cx(
              'mt-2 inline-flex min-h-9 items-center justify-center rounded-full border px-4 text-button transition-colors disabled:opacity-60',
              isReady ? 'border-text bg-text text-white' : 'border-text bg-white text-text hover:bg-bg'
            )}
          >
            {isResponseProcessing ? 'Processing response…' : isReady ? 'Leave debate' : 'Join debate'}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Text as="p" variant={textVariant} color="grey-04">
            Respond before joining
          </Text>
          <DebateEntityResponseControls
            entityId={entityId}
            spaceId={spaceId}
            responseKind={debateClaim.response_kind}
          />
        </div>
      )}

      {isReady && (
        <Text as="p" variant={textVariant} color="grey-04" className="mt-2">
          Waiting for someone with the opposite response.
        </Text>
      )}
      {(mutationError || debateClaim.readiness_disabled_reason) && (
        <Text as="p" variant={textVariant} color="red-01" className="mt-2">
          {mutationError ?? readinessReasonMessage(debateClaim.readiness_disabled_reason)}
        </Text>
      )}
    </div>
  );
}

function readinessReasonMessage(reason: string | null) {
  switch (reason) {
    case 'claim_response_withdrawn':
      return 'Your response was withdrawn, so debate readiness was turned off.';
    case 'claim_response_kind_changed':
      return 'This claim’s response type changed. Respond and join again.';
    case 'claim_response_validation_failed':
      return 'Your response could not be verified yet. You’ll remain ready while verification retries.';
    default:
      return reason;
  }
}

function OnlineChoices({ responseKind, choices }: { responseKind: DebateResponseKind; choices: DebateOnlineChoice[] }) {
  return (
    <div>
      <Text as="div" variant="metadataMedium" color="grey-04" className="mb-1">
        Ready to debate
      </Text>
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map(position => {
          const choice = choices.find(candidate => candidate.position === position);
          const participantCount = choice?.participant_count ?? 0;
          const label = choice?.position_label || responsePositionLabel(responseKind, position);

          return (
            <div
              key={String(position)}
              aria-label={`${label}, ${participantCount} participant${participantCount === 1 ? '' : 's'} available`}
              className="flex min-h-9 min-w-0 items-center justify-between gap-2 rounded-full bg-bg px-3 text-button text-text"
            >
              <span className="truncate">{label}</span>
              {choice && <OnlineChoiceParticipants choice={choice} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OnlineChoiceParticipants({ choice }: { choice: DebateOnlineChoice }) {
  const participants = choice.participants.slice(0, 2);
  const overflowCount = Math.max(0, choice.participant_count - participants.length);

  if (participants.length === 0 && overflowCount === 0) return null;

  return (
    <span aria-hidden="true" className="flex shrink-0 items-center -space-x-2">
      {participants.map(participant => {
        const label = participant.display_name || participant.profile_space_id;

        return (
          <span
            key={participant.user_id}
            title={label}
            className="relative box-content block size-5 overflow-hidden rounded-full border-2 border-white"
          >
            <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} alt={label} size={20} />
          </span>
        );
      })}
      {overflowCount > 0 && (
        <span className="relative box-content flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-grey-02 px-1 text-[11px] leading-5 text-grey-04 tabular-nums">
          +{overflowCount}
        </span>
      )}
    </span>
  );
}
