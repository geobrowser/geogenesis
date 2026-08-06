import { EntityVoteButtons } from '~/partials/entity-page/entity-vote-buttons';

import type { DebateResponseKind } from './api';

export function DebateEntityResponseControls({
  entityId,
  spaceId,
  responseKind,
}: {
  entityId: string;
  spaceId: string;
  responseKind: DebateResponseKind | null;
}) {
  return (
    <EntityVoteButtons
      entityId={entityId}
      spaceId={spaceId}
      responseKind={responseKind}
      claimResponderAvatarsPosition="trailing"
      showProcessingLabel
    />
  );
}
