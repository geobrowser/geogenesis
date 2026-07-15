'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { isClaimPublished } from '~/core/claims/publish';
import { useDebatesEnabled } from '~/core/state/feature-flags';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { Check } from '~/design-system/icons/check';
import { Text } from '~/design-system/text';

import type { DebateClaim, DebateOnlineChoice } from './api';
import { useDebateActivity, useDebateClaims, useJoinDebateQueue } from './hooks';

type ClaimDebateButtonProps = {
  entityId: string;
  spaceId: string;
  /**
   * The entity, if the parent already subscribes to it (e.g. the entity-page
   * header). Passing it avoids a duplicate `useQueryEntity` subscription on the
   * entity-page hot path; omit it to let the button fetch on its own.
   */
  entity?: Entity | null;
};

const positions = [
  { label: 'Yes', value: true },
  { label: 'No', value: false },
] as const;

export function ClaimDebateButton({ entityId, spaceId, entity: providedEntity }: ClaimDebateButtonProps) {
  const isDebatesEnabled = useDebatesEnabled();

  const { entity: fetchedEntity } = useQueryEntity({
    id: entityId,
    spaceId,
    enabled: isDebatesEnabled && providedEntity == null,
  });
  const entity = providedEntity ?? fetchedEntity;

  const isClaim = entity?.types.some(type => type.id === CLAIM_TYPE_ID) ?? false;
  const published = entity ? isClaimPublished(entity) : false;

  const debateClaimsQuery = useDebateClaims(spaceId, published ? [entityId] : [], isDebatesEnabled && isClaim);
  const debateClaim = debateClaimsQuery.data?.claims.find(claim => claim.claim_entity_id === entityId) ?? null;

  const activityQuery = useDebateActivity(isDebatesEnabled && isClaim);
  const activity = activityQuery.data ?? null;
  const hasActiveFlowElsewhere = Boolean(activity?.match || activity?.debate || activity?.rematch);

  const joinQueue = useJoinDebateQueue(spaceId);

  if (!isDebatesEnabled || !isClaim) return null;

  const activeMatch = debateClaim?.active_match ?? null;
  const activeDebate = debateClaim?.active_debate ?? null;
  const canJoinDebate = published && !activeDebate && !activeMatch && !hasActiveFlowElsewhere;
  const mutationError = joinQueue.error instanceof Error ? joinQueue.error.message : null;

  const joinPosition = (position: boolean) => {
    joinQueue.mutate({ claimId: entityId, request: { position } });
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cx(
            'inline-flex h-7 items-center rounded-full border px-3 text-button transition-colors',
            'border-grey-02 bg-white text-text hover:border-text',
            'data-[state=open]:border-text data-[state=open]:bg-text data-[state=open]:text-white'
          )}
        >
          Debate
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          side="bottom"
          sideOffset={8}
          className="z-100 w-[305px] rounded-xl border border-grey-02 bg-white p-5 text-text shadow-lg"
        >
          <Text as="h3" variant="smallTitle" color="text">
            Debate this claim
          </Text>
          <Text as="p" variant="metadata" color="grey-04" className="mt-1">
            Select your position and start matchmaking
          </Text>

          <div className="mt-5 grid grid-cols-2 gap-2">
            {positions.map(position => {
              const choice = debateClaim?.online_choices.find(choice => choice.position === position.value) ?? null;
              const label = choice?.position_label ?? position.label;
              const participantCount = choice?.participant_count ?? 0;
              const selected = debateClaim?.viewer_waiting_position === position.value;
              const accessibleLabel = `${label}, ${participantCount} participant${participantCount === 1 ? '' : 's'} available${selected ? ', selected' : ''}`;

              return (
                <button
                  key={position.label}
                  type="button"
                  aria-label={accessibleLabel}
                  aria-pressed={selected}
                  onClick={() => joinPosition(position.value)}
                  disabled={!canJoinDebate || joinQueue.isPending || selected}
                  className={cx(
                    'flex min-h-7 min-w-0 items-center justify-between gap-2 rounded-full px-3 text-button transition-colors disabled:opacity-60',
                    selected ? 'bg-green text-text' : 'bg-bg text-text'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {selected && (
                      <span aria-hidden="true" className="shrink-0">
                        <Check />
                      </span>
                    )}
                    <span className="truncate">{label}</span>
                  </span>
                  {choice && <OnlineChoiceParticipants choice={choice} />}
                </button>
              );
            })}
          </div>

          <ClaimDebateStatus debateClaim={debateClaim} mutationError={mutationError} published={published} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
            className="relative box-content block h-5 w-5 overflow-hidden rounded-full border-2 border-white"
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

function ClaimDebateStatus({
  debateClaim,
  mutationError,
  published,
}: {
  debateClaim: DebateClaim | null;
  mutationError: string | null;
  published: boolean;
}) {
  if (mutationError) {
    return (
      <Text as="p" variant="metadata" color="red-01" className="mt-3">
        {mutationError}
      </Text>
    );
  }

  if (!published) {
    return (
      <Text as="p" variant="metadata" color="grey-04" className="mt-3">
        Publish this claim before starting a debate.
      </Text>
    );
  }

  if (debateClaim?.active_debate) {
    return (
      <Text as="p" variant="metadata" color="grey-04" className="mt-3">
        Debate {debateClaim.active_debate.status.replace('_', ' ')}
      </Text>
    );
  }

  if (debateClaim?.active_match) {
    return (
      <Text as="p" variant="metadata" color="grey-04" className="mt-3">
        Match found. Both speakers need to accept.
      </Text>
    );
  }

  if (debateClaim?.viewer_waiting_position !== null && debateClaim?.viewer_waiting_position !== undefined) {
    return (
      <Text as="p" variant="metadata" color="grey-04" className="mt-3">
        Waiting for someone with the opposite position.
      </Text>
    );
  }

  return null;
}
