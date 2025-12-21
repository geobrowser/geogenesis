'use client';

import * as React from 'react';
import { SystemIds } from '@graphprotocol/grc-20';

import { useRelations, useValues } from '~/core/sync/use-store';
import { Text } from '~/design-system/text';
import { PowerToolsRelationChip } from './power-tools-relation-chip';

interface Props {
  entityId: string;
  spaceId: string;
  entity: any;
}

export function EntityPanelContent({ entityId, spaceId, entity }: Props) {
  // Get all relations for this entity
  const relations = useRelations({
    selector: (r) => r.fromEntity.id === entityId && !r.isDeleted
  });

  // Get all values for this entity
  const values = useValues({
    selector: (v) => v.entity.id === entityId && !v.isDeleted
  });

  // Group relations by property type
  const relationsByType = React.useMemo(() => {
    const grouped = new Map<string, typeof relations>();
    relations.forEach(relation => {
      const typeId = relation.type.id;
      if (!grouped.has(typeId)) {
        grouped.set(typeId, []);
      }
      grouped.get(typeId)?.push(relation);
    });
    return grouped;
  }, [relations]);

  // Group values by property
  const valuesByProperty = React.useMemo(() => {
    const grouped = new Map<string, typeof values>();
    values.forEach(value => {
      const propId = value.property.id;
      if (!grouped.has(propId)) {
        grouped.set(propId, []);
      }
      grouped.get(propId)?.push(value);
    });
    return grouped;
  }, [values]);

  const [clickedEntityId, setClickedEntityId] = React.useState<string | null>(null);

  const handleRelationClick = (relEntityId: string) => {
    setClickedEntityId(relEntityId);
  };

  return (
    <div className="space-y-4">
      {/* Entity Name and Description */}
      <div>
        <Text variant="largeTitle">{entity?.name || 'Untitled'}</Text>
        {entity?.description && (
          <Text variant="body" color="grey-04" className="mt-2">
            {entity.description}
          </Text>
        )}
      </div>

      {/* Values */}
      {valuesByProperty.size > 0 && (
        <div className="space-y-3">
          <Text variant="mediumTitle">Properties</Text>
          {Array.from(valuesByProperty.entries()).map(([propId, propValues]) => {
            // Skip system properties we don't want to show
            if (propId === SystemIds.NAME_PROPERTY || propId === SystemIds.DESCRIPTION_PROPERTY) {
              return null;
            }

            const propertyName = propValues[0]?.property?.name || propId;

            return (
              <div key={propId} className="border-l-2 border-grey-02 pl-3">
                <Text variant="metadata" color="grey-04">
                  {propertyName}
                </Text>
                <div className="mt-1">
                  {propValues.map((value, idx) => (
                    <Text key={idx} variant="body">
                      {value.value || '—'}
                    </Text>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Relations */}
      {relationsByType.size > 0 && (
        <div className="space-y-3">
          <Text variant="mediumTitle">Relations</Text>
          {Array.from(relationsByType.entries()).map(([typeId, typeRelations]) => {
            // Skip certain system relations
            if (typeId === SystemIds.TYPES_PROPERTY) {
              return null;
            }

            const typeName = typeRelations[0]?.type?.name || typeId;

            return (
              <div key={typeId} className="border-l-2 border-grey-02 pl-3">
                <Text variant="metadata" color="grey-04">
                  {typeName}
                </Text>
                <div className="mt-1 flex flex-wrap gap-1">
                  {typeRelations.map((relation) => (
                    <PowerToolsRelationChip
                      key={relation.id}
                      relationId={relation.toEntity.id}
                      relationName={relation.toEntity.name ?? undefined}
                      spaceId={spaceId}
                      onClick={handleRelationClick}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nested entity view */}
      {clickedEntityId && (
        <EntityPanelContent
          entityId={clickedEntityId}
          spaceId={spaceId}
          entity={{ id: clickedEntityId }}
        />
      )}

      {/* Fallback if no content */}
      {valuesByProperty.size === 0 && relationsByType.size === 0 && (
        <Text variant="body" color="grey-04">
          No properties or relations found for this entity.
        </Text>
      )}
    </div>
  );
}