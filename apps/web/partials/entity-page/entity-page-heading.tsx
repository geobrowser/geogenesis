'use client';

import { useRelationship } from '~/core/hooks/use-relationship';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { RelationshipHeading } from '~/partials/entity-page/relationship-heading';

type EntityPageHeadingProps = {
  spaceId: string;
  entityId: string;
};

export const EntityPageHeading = ({ spaceId, entityId }: EntityPageHeadingProps) => {
  const [isRelationPage, relationship] = useRelationship(entityId, spaceId);

  return !isRelationPage ? (
    <EditableHeading spaceId={spaceId} entityId={entityId} />
  ) : (
    <RelationshipHeading relationship={relationship} />
  );
};
