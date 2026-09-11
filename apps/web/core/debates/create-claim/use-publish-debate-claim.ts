'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { type ClaimDraftSelection, buildClaimDraft } from '~/core/claims/claim-draft';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
import { usePublish } from '~/core/hooks/use-publish';
import { ID } from '~/core/id';
import type { Value } from '~/core/types';

import { findExistingClaimInSpace } from './find-existing-claim';
import { usePendingDebateClaims } from './use-pending-debate-claims';

export type PublishDebateClaimInput = {
  spaceId: string;
  claimText: string;
  topics?: ClaimDraftSelection[];
};

export type PublishDebateClaimResult = {
  claimId: string;
  alreadyExisted: boolean;
};

function claimEditName(claimText: string): string {
  const trimmed = claimText.trim();
  return trimmed.length > 80 ? `Claim: ${trimmed.slice(0, 77)}…` : `Claim: ${trimmed}`;
}

/**
 * Creates a debate claim and posts it directly to the selected space - no review-edits flow.
 *
 * The Claim has Claim Type, the claim text as name and the Debate tag (required: it is what
 * makes the claim visible to the debates surfaces, which query the graph by that tag) and any selected
 * subjects. `is factual` is not written intentionally. So, the claim reads Agree/Disagree.
 */
export function usePublishDebateClaim() {
  const { makeProposal } = usePublish();
  const { addPendingClaim, dismissPendingClaim } = usePendingDebateClaims();

  const publishClaim = React.useCallback(
    async (
      input: PublishDebateClaimInput,
      callbacks?: { onSuccess?: () => void; onError?: () => void }
    ): Promise<PublishDebateClaimResult> => {
      const { spaceId, claimText, topics } = input;
      const trimmedText = claimText.trim();

      try {
        const existingId = await findExistingClaimInSpace(spaceId, claimText);
        if (existingId) {
          callbacks?.onSuccess?.();
          return { claimId: existingId, alreadyExisted: true };
        }
      } catch {
        // fall through to creation
      }

      const topicSelections = topics ?? [];
      const draft = buildClaimDraft({
        spaceId,
        claimText,
        topics: topicSelections,
        tags: [{ id: DEBATE_TAG_ID, name: 'Debate' }],
      });

      const values: Value[] = draft.names.map(name => ({
        id: ID.createEntityId(),
        entity: { id: name.entityId, name: name.value },
        property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
        value: name.value,
        spaceId: name.spaceId,
      }));

      addPendingClaim({ claimId: draft.claimId, spaceId, text: trimmedText, topics: topicSelections });

      void makeProposal({
        values,
        relations: draft.relations,
        spaceId,
        name: claimEditName(claimText),
        votingMode: 'FAST',
        onSuccess: callbacks?.onSuccess,
        onError: () => {
          dismissPendingClaim(draft.claimId);
          callbacks?.onError?.();
        },
      });

      return { claimId: draft.claimId, alreadyExisted: false };
    },
    [addPendingClaim, dismissPendingClaim, makeProposal]
  );

  return { publishClaim };
}
