import type { Proposal } from '~/core/io/dto/proposals';
import { fetchProposalDiffs } from '~/core/io/subgraph/fetch-proposal-diffs';

import { Text } from '~/design-system/text';

import { ChangedEntity } from '~/partials/diffs/changed-entity';

export async function ContentProposal({ proposal, spaceId }: { proposal: Proposal; spaceId: string }) {
  const result = await fetchProposalDiffs(proposal.id, proposal.space.id);

  if (result.status === 'encoding_error') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <Text variant="bodySemibold" color="grey-04">
          Encoding error
        </Text>
        <Text variant="body" color="grey-04">
          The edit data for this proposal failed validation and cannot be decoded. The proposal edits may need
          re-encoding.
        </Text>
      </div>
    );
  }

  if (result.status === 'not_cached') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <Text variant="bodySemibold" color="grey-04">
          Changes could not be loaded
        </Text>
        <Text variant="body" color="grey-04">
          The diff data for this proposal is not yet available. This can happen for proposals published via the SDK.
        </Text>
      </div>
    );
  }

  const changes = result.entities;

  if (changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Text variant="bodySemibold" color="grey-04">
          No changes to display
        </Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {changes.map(entity => (
        <div key={entity.entityId} className="rounded-xl bg-white p-4">
          <div className="relative mx-auto w-full max-w-[1350px] shrink-0">
            <ChangedEntity entity={entity} spaceId={spaceId} />
          </div>
        </div>
      ))}
    </div>
  );
}
