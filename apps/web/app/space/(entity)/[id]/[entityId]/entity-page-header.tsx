'use client';

import type { Relation } from '~/core/types';

import { ClaimTopicButton } from '~/partials/entity-page/claim-topic-button';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageInlineDescription } from '~/partials/entity-page/entity-page-inline-description';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { EntityPageRelations } from '~/partials/entity-page/entity-page-relations';

interface EntityPageHeaderProps {
  showHeading: boolean;
  showHeader: boolean;
  entityId: string;
  spaceId: string;
  serverRelations: Relation[];
  canClaimTopic?: boolean;
  coverUrl?: string | null;
}

export function EntityPageHeader({
  showHeading,
  showHeader,
  entityId,
  spaceId,
  serverRelations,
  canClaimTopic = false,
  coverUrl = null,
}: EntityPageHeaderProps) {
  return (
    <div className="space-y-2">
      <EntityPageRelations entityId={entityId} spaceId={spaceId} serverRelations={serverRelations} />
      {showHeading && (
        <EditableHeading
          spaceId={spaceId}
          entityId={entityId}
          topRightSlot={
            canClaimTopic ? <ClaimTopicButton entityId={entityId} spaceId={spaceId} coverUrl={coverUrl} /> : null
          }
        />
      )}
      {showHeading && <EntityPageInlineDescription entityId={entityId} spaceId={spaceId} />}
      {showHeader && <EntityPageMetadataHeader id={entityId} spaceId={spaceId} isVoteable />}
    </div>
  );
}
