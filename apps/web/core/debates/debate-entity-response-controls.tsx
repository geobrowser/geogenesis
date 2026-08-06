import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

export function DebateEntityResponseControls({ entityId, spaceId }: { entityId: string; spaceId: string }) {
  return (
    <EntityVoteButtons
      entityId={entityId}
      spaceId={spaceId}
      claimResponderAvatarsPosition="trailing"
      showProcessingLabel
    />
  );
}
