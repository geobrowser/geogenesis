'use client';

import * as React from 'react';

import { withActionContext } from '~/core/action-context';
import { useActionContext } from '~/core/action-context-provider';
import { ClaimSummary } from '~/core/claims/browse/claim-summary';
import { DebateClaimControls } from '~/core/debates/browse/debate-claim-controls';
import { useDebateClaimResponse } from '~/core/debates/browse/use-debate-claim-response';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { CLAIM_RESPONSE_COPY } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';

/**
 * The open claim's split and its labeled Agree / Disagree, at the top of the graph explorer's side
 * panel (GEO-3841). The same pills and split the claim page and debate cards draw, so a side taken
 * here shows on all of them.
 *
 * Signed out, a press opens sign-in first and holds the side until the account can publish it,
 * rather than keeping it on this device: the graph explorer has no save sheet flow of its own.
 */
export function GraphClaimPosition({ claimId, spaceId }: { claimId: string; spaceId: string }) {
  // The claim on the graph: geo-chat has no row for most spaces the map reaches, and without one of
  // the two the response kind never resolves and the pills stay disabled.
  const { entities } = useQueryEntities({ where: { id: { in: [claimId] } }, first: 1 });
  const response = useDebateClaimResponse({
    claimId,
    spaceId,
    row: null,
    entity: entities[0] ?? null,
    allowsSignedOutVotes: false,
  });
  const { control } = response;

  const { ready: authReady, authenticated } = useGeoChatAuth();
  // Known to be signed out. While Privy is still restoring a session a press is the control's to drop.
  const signedOut = authReady && !authenticated;
  const promptSignIn = usePrivySignIn();
  const getContext = useActionContext('claim_position_control', 'claim', claimId);

  const answersReady = response.isResponseKindResolved && response.isViewerResponseResolved;
  const signedOutControl = signedOut
    ? {
        ...control,
        canRespond: answersReady && !response.responseBlockedReason,
        actionTitle: () =>
          response.responseBlockedReason ??
          (answersReady ? CLAIM_RESPONSE_COPY.signIn : 'Loading this claim’s responses…'),
        respond: (position: boolean) => {
          const context = getContext();
          const attempt = promptSignIn(
            {
              ...context,
              auth_control: `${response.responseKind}_${position ? 'positive' : 'negative'}`,
              auth_intent: 'vote',
              auth_continuation: 'queued',
            },
            // A dismissed sign-in withdraws the side, so walking away never publishes it later.
            { onCancel: control.cancelQueuedPosition }
          );
          // Queued at the press, not from the sign-in's completion: the panel can remount meanwhile.
          withActionContext({ ...context, auth_attempt_id: attempt?.id }, () => control.queuePosition(position));
        },
      }
    : control;

  return (
    <div className="flex flex-col gap-3">
      {!response.summary.isLoading ? (
        <ClaimSummary
          entityId={claimId}
          spaceId={spaceId}
          responseKind={response.responseKind}
          summary={response.summary}
        />
      ) : null}
      <DebateClaimControls
        claimId={claimId}
        spaceId={spaceId}
        response={{ ...response, control: signedOutControl }}
        analyticsSurface="graph-explorer"
      />
    </div>
  );
}
