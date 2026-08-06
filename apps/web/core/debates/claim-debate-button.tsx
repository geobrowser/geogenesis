'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { isClaimPublished } from '~/core/claims/publish';
import { useDebatesEnabled } from '~/core/state/feature-flags';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import { Text } from '~/design-system/text';

import type { DebateClaim } from './api';
import { ClaimDebateReadiness } from './claim-debate-readiness';
import { useDebateActivity, useDebateClaims } from './hooks';

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

  if (!isDebatesEnabled || !isClaim) return null;

  const activeMatch = debateClaim?.active_match ?? null;
  const activeDebate = debateClaim?.active_debate ?? null;
  const canJoinDebate = published && !activeDebate && !activeMatch && !hasActiveFlowElsewhere;
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
            Respond to the claim, then choose whether you’re ready to debate.
          </Text>

          {published && (
            <ClaimDebateReadiness
              debateClaim={debateClaim}
              entityId={entityId}
              spaceId={spaceId}
              canToggle={canJoinDebate}
              className="mt-5"
            />
          )}

          <ClaimDebateStatus debateClaim={debateClaim} published={published} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ClaimDebateStatus({ debateClaim, published }: { debateClaim: DebateClaim | null; published: boolean }) {
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

  return null;
}
