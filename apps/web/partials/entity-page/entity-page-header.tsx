'use client';

import type { Relation } from '~/core/types';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageActions } from '~/partials/entity-page/entity-page-actions';
import { EntityPageInlineDescription } from '~/partials/entity-page/entity-page-inline-description';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { EntityPageRelations } from '~/partials/entity-page/entity-page-relations';

interface EntityPageHeaderProps {
  showHeading: boolean;
  showHeader: boolean;
  entityId: string;
  spaceId: string;
  serverRelations: Relation[];
}

export function EntityPageHeader({
  showHeading,
  showHeader,
  entityId,
  spaceId,
  serverRelations,
}: EntityPageHeaderProps) {
  return (
    <div className="space-y-2">
      <EntityPageRelations entityId={entityId} spaceId={spaceId} serverRelations={serverRelations} />
      {showHeading && <EditableHeading spaceId={spaceId} entityId={entityId} />}
      {showHeading && <EntityPageInlineDescription entityId={entityId} spaceId={spaceId} />}
      <div className="flex items-center gap-4 text-text">
        {showHeader && <EntityPageMetadataHeader id={entityId} spaceId={spaceId} />}
        <EntityPageActions entityId={entityId} spaceId={spaceId} isVoteable />
      </div>
    </div>
  );
}
