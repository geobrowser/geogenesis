'use client';

import type { Relation } from '~/core/types';

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
      {showHeader && <EntityPageMetadataHeader id={entityId} spaceId={spaceId} isVoteable />}
    </div>
  );
}
