'use client';

import * as React from 'react';

import { ClaimSummary } from '~/core/claims/browse/claim-summary';
import type { Debate } from '~/core/debates/api';
import { PositionRow } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { CLAIM_RESPONSE_KIND } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';
import { normId } from '~/core/utils/norm-id';

import { Text } from '~/design-system/text';

import { useDebateClaimResponse } from './use-debate-claim-response';

/**
 * The lower half of a debate card: where the debate is, what it argues, and the reader's side on it
 * (GEO-3454).
 *
 * The full-screen feed and the explore card both put this directly under the player, inside one
 * frame with it, so the claim and the video read as one thing. The two differ only in their meta
 * row, their title link and the actions they carry, which the hosts pass in.
 *
 * Agree and Disagree publish the viewer's position on the debate's *claim* — the same response the
 * claim page, the claims panel and the end card record, through the same hook, so a side taken here
 * shows on all of them. They replace the up/down vote the debate used to carry. The comments and
 * share in `actions` stay the debate's.
 */
export function DebateClaimFooter({
  claim,
  enabled,
  meta,
  title,
  actions,
  className,
}: {
  /** The claim being debated, or null while the host has not resolved its debate. */
  claim: Debate['claim'] | null;
  /**
   * Whether this card should read the claim's responses yet. Latched: once a card has asked, it
   * keeps its numbers while it is mounted, for the reason `useDebateEndCard` gives.
   */
  enabled: boolean;
  meta: React.ReactNode;
  title: React.ReactNode;
  /** The debate's own controls, drawn at the end of the Agree/Disagree row. */
  actions: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-1.5 px-3 pt-3">
        {meta}
        {title}
      </div>
      {claim ? (
        <ClaimPositions
          key={`${claim.space_id}:${claim.claim_entity_id}`}
          claim={claim}
          enabled={enabled}
          actions={actions}
        />
      ) : (
        // Held at its finished size while the debate resolves, so the card does not grow under the
        // reader when it lands. Without `onRespond` the pills draw as inert shapes.
        <div className="px-3 pt-3 pb-3">
          <PositionRow
            positions={[]}
            responseKind={CLAIM_RESPONSE_KIND}
            viewerPosition={null}
            showParticipants={false}
            endSlot={actions}
          />
        </div>
      )}
    </div>
  );
}

function ClaimPositions({
  claim,
  enabled,
  actions,
}: {
  claim: Debate['claim'];
  enabled: boolean;
  actions: React.ReactNode;
}) {
  const [live, setLive] = React.useState(enabled);
  if (enabled && !live) setLive(true);

  // One spelling of the ids for every read, so these land on the end card's cache keys and a side
  // taken in one shows in the other. geo-chat and the graph format ids differently.
  const spaceId = normId(claim.space_id);
  const claimId = normId(claim.claim_entity_id);
  const { entities } = useQueryEntities({ where: { id: { in: [claimId] } }, first: 1, enabled: live });
  const { responseKind, summary, control } = useDebateClaimResponse({
    claimId,
    spaceId,
    row: null,
    entity: live ? (entities[0] ?? null) : null,
    savePromptSurface: 'feed',
  });

  return (
    <>
      <div className="px-3 pt-3 pb-3">
        <PositionRow
          positions={control.optimisticPositions}
          responseKind={responseKind}
          viewerPosition={control.viewerPosition}
          onRespond={control.respond}
          disabled={!control.canRespond}
          pending={control.isResponseSubmitting}
          titleFor={control.actionTitle}
          localSide={control.localVoteSide}
          // The split band below already shows who voted; faces in the pills would read as the
          // same people a second time.
          showParticipants={false}
          endSlot={actions}
          analyticsSurface="debate-card"
        />
        {control.responseError ? (
          <div role="alert" className="mt-1.5">
            <Text as="p" variant="footnote" color="red-01">
              {control.responseError}
            </Text>
          </div>
        ) : null}
      </div>
      {summary.isLoading ? null : (
        <ClaimSummary
          entityId={claimId}
          spaceId={spaceId}
          responseKind={responseKind}
          summary={summary}
          layout="inline"
          className="claim-card-summary-band"
        />
      )}
    </>
  );
}
