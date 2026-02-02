'use client';

import { useRelationEntityRelations } from '~/core/state/entity-page-store/entity-store';
import type { Relation } from '~/core/types';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
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
  const relations = useRelationEntityRelations(entityId, spaceId);
  const isRelationPage = relations.length > 0;

  return (
    <div className="space-y-2">
      <EntityPageRelations entityId={entityId} spaceId={spaceId} serverRelations={serverRelations} />
      {showHeading && <EditableHeading spaceId={spaceId} entityId={entityId} />}
      {showHeader && !isRelationPage && <EntityPageMetadataHeader id={entityId} spaceId={spaceId} />}
    </div>
  );
}
