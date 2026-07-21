'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { isClaimPublished } from '~/core/claims/publish';
import type { DebateClaim, DebateOnlineChoice } from '~/core/debates/api';
import { useDebateClaims, useJoinDebateQueue } from '~/core/debates/hooks';
import { useQueryEntities } from '~/core/sync/use-store';

import { Avatar } from '~/design-system/avatar';
import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

/**
 * "Join a debate" panel opened from the browse feed's Join debate button. Lists
 * the space's published claims with For/Against entry points into the debate
 * queue — the same mechanism the Claims tab uses.
 */
export function JoinDebatePanel({ spaceId, onClose }: { spaceId: string; onClose: () => void }) {
  const { entities: claims } = useQueryEntities({
    where: {
      spaces: [{ equals: spaceId }],
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
    },
    first: 50,
    placeholderData: keepPreviousData,
    includeUnpublishedLocal: true,
  });
  const publishedClaimIds = React.useMemo(() => claims.filter(isClaimPublished).map(claim => claim.id), [claims]);
  const debateClaimsQuery = useDebateClaims(spaceId, publishedClaimIds, true);
  const debateClaims = debateClaimsQuery.data?.claims ?? [];

  // Topics live on the KG claim entity, not the debates API, so resolve them here
  // to label each card the way the frame does ("Handbags", "Fast Fashion").
  const topicByClaimId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const claim of claims) {
      const topic = claim.relations.find(
        relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true
      );
      if (topic) map.set(claim.id, topic.toEntity.name ?? topic.toEntity.id);
    }
    return map;
  }, [claims]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-divider bg-white md:w-full">
      <header className="flex items-center justify-between px-5 py-4">
        <Text as="h2" variant="cardEntityTitle" color="text">
          Join a debate
        </Text>
        <button type="button" aria-label="Close" onClick={onClose} className="text-grey-04 hover:text-text">
          <Close />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-6">
        {debateClaims.length === 0 && (
          <Text as="p" variant="metadata" color="grey-04">
            No published claims are available to debate yet.
          </Text>
        )}
        {debateClaims.map(debateClaim => (
          <JoinDebateCard
            key={debateClaim.id}
            spaceId={spaceId}
            debateClaim={debateClaim}
            topic={topicByClaimId.get(debateClaim.claim_entity_id) ?? null}
          />
        ))}
      </div>
    </aside>
  );
}

function JoinDebateCard({
  spaceId,
  debateClaim,
  topic,
}: {
  spaceId: string;
  debateClaim: DebateClaim;
  topic: string | null;
}) {
  const joinQueue = useJoinDebateQueue(spaceId);
  const canJoin = !debateClaim.active_debate && !debateClaim.active_match;
  const forChoice = debateClaim.online_choices.find(choice => choice.position === true);
  const againstChoice = debateClaim.online_choices.find(choice => choice.position === false);

  return (
    <article className="rounded-lg border border-grey-02 bg-white p-4 shadow-light">
      {topic && (
        <Text as="span" variant="metadata" color="grey-04" className="mb-1 block">
          {topic}
        </Text>
      )}
      <Text as="h3" variant="bodySemibold" color="text" className="block">
        {debateClaim.claim}
      </Text>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <PositionButton
          label={forChoice?.position_label ?? 'For'}
          choice={forChoice}
          disabled={!canJoin || joinQueue.isPending || debateClaim.viewer_waiting_position === true}
          selected={debateClaim.viewer_waiting_position === true}
          onClick={() => joinQueue.mutate({ claimId: debateClaim.claim_entity_id, request: { position: true } })}
        />
        <PositionButton
          label={againstChoice?.position_label ?? 'Against'}
          choice={againstChoice}
          disabled={!canJoin || joinQueue.isPending || debateClaim.viewer_waiting_position === false}
          selected={debateClaim.viewer_waiting_position === false}
          onClick={() => joinQueue.mutate({ claimId: debateClaim.claim_entity_id, request: { position: false } })}
        />
      </div>
    </article>
  );
}

function PositionButton({
  label,
  choice,
  disabled,
  selected,
  onClick,
}: {
  label: string;
  choice: DebateOnlineChoice | undefined;
  disabled: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-9 items-center justify-between gap-2 rounded-full bg-bg px-3 text-button text-text transition-colors hover:bg-grey-01 disabled:opacity-60 aria-pressed:bg-green"
    >
      <span className="truncate">{label}</span>
      {choice && choice.participant_count > 0 && <ChoiceAvatars choice={choice} />}
    </button>
  );
}

function ChoiceAvatars({ choice }: { choice: DebateOnlineChoice }) {
  const participants = choice.participants.slice(0, 2);
  const overflow = Math.max(0, choice.participant_count - participants.length);
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center -space-x-2">
      {participants.map(participant => (
        <span
          key={participant.user_id}
          className="relative box-content block size-5 overflow-hidden rounded-full border-2 border-white"
        >
          <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={20} />
        </span>
      ))}
      {overflow > 0 && (
        <span className="relative box-content flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-grey-02 px-1 text-[11px] leading-5 text-grey-04 tabular-nums">
          +{overflow}
        </span>
      )}
    </span>
  );
}
