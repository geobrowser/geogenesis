'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { DebateClaim } from '~/core/debates/api';
import { ClaimDebateReadiness } from '~/core/debates/claim-debate-readiness';
import { useDebateActivity, useDebateClaims, useUpdateDebateAvailability } from '~/core/debates/hooks';
import { useQueryEntities } from '~/core/sync/use-store';
import { validateEntityId } from '~/core/utils/utils';

import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

/**
 * "Join a debate" panel opened from the browse feed's Join debate button. Lists
 * the space's published claims with their response-derived readiness controls.
 */
export function JoinDebatePanel({ spaceId, onClose }: { spaceId: string; onClose: () => void }) {
  // geo-chat indexes the space's debatable claims, so ask it directly rather than
  // scanning the KG for every Claim entity in the space (that scan 504s on large
  // spaces). The KG is only needed for topic labels, fetched by id below.
  const debateClaimsQuery = useDebateClaims(spaceId, null, true);
  const debateClaims = debateClaimsQuery.data?.claims ?? [];

  const isLoading = debateClaimsQuery.isLoading;
  const loadError = debateClaimsQuery.error;
  const emptyMessage = isLoading
    ? 'Loading claims…'
    : loadError
      ? `Could not load claims: ${loadError.message}`
      : 'No claims are available to debate yet.';

  // Only real entity ids can be looked up in the KG; the graph 400s the whole
  // batch on a single malformed id, so drop any that aren't valid.
  const claimEntityIds = React.useMemo(
    () => debateClaims.map(claim => claim.claim_entity_id).filter(validateEntityId),
    [debateClaims]
  );
  const { entities: claimEntities } = useQueryEntities({
    where: { id: { in: claimEntityIds } },
    enabled: claimEntityIds.length > 0,
    placeholderData: keepPreviousData,
  });

  // Topics live on the KG claim entity, not the debates API, so resolve them here
  // to label each card the way the frame does ("Handbags", "Fast Fashion").
  const topicByClaimId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const claim of claimEntities) {
      const topic = claim.relations.find(
        relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true
      );
      if (topic) map.set(claim.id, topic.toEntity.name ?? topic.toEntity.id);
    }
    return map;
  }, [claimEntities]);

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
      <DebateAnythingRow />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-6">
        {debateClaims.length === 0 && (
          <Text as="p" variant="metadata" color="grey-04">
            {emptyMessage}
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

/**
 * For users who don't want to pick a specific claim: toggles the account's
 * `available_to_debate` flag (the same pool the navbar toggle writes to) so
 * matchmaking can pair them with anyone waiting.
 */
function DebateAnythingRow() {
  const activityQuery = useDebateActivity();
  const availabilityMutation = useUpdateDebateAvailability();
  const available = activityQuery.data?.available_to_debate ?? false;
  const pending = activityQuery.isPending || availabilityMutation.isPending;

  return (
    <div className="flex items-center justify-between gap-3 px-5 pb-4">
      <Text as="span" variant="metadata" color="grey-04">
        Don’t care about the subject?
      </Text>
      <button
        type="button"
        aria-pressed={available}
        disabled={pending}
        onClick={() => availabilityMutation.mutate(!available)}
        className={cx(
          'inline-flex h-7 shrink-0 items-center rounded-full border px-3 text-button transition-colors disabled:cursor-wait disabled:opacity-60',
          available ? 'border-text bg-text text-white' : 'border-text bg-white text-text hover:bg-bg'
        )}
      >
        {available ? 'Debating anything' : 'Debate anything'}
      </button>
    </div>
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
  const canJoin = !debateClaim.active_debate && !debateClaim.active_match;

  return (
    <article className="rounded-lg border border-grey-02 bg-white p-5">
      {topic && (
        <Text as="span" variant="metadata" color="grey-04" className="mb-1 block">
          {topic}
        </Text>
      )}
      <Text as="h3" variant="smallTitle" color="text" className="block">
        {debateClaim.claim}
      </Text>
      <ClaimDebateReadiness
        debateClaim={debateClaim}
        entityId={debateClaim.claim_entity_id}
        spaceId={spaceId}
        canToggle={canJoin}
        className="mt-3"
      />
    </article>
  );
}
