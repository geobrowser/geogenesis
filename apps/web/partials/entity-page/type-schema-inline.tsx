'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { PROPERTY_GROUPS_PROPERTY } from '~/core/constants';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEntityTypes } from '~/core/state/entity-page-store/entity-store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { sortRelations } from '~/core/utils/utils';

import { LinkableRelationChip } from '~/design-system/chip';
import { Text } from '~/design-system/text';

import { TypePropertyGroupsEditor } from '~/partials/entity-page/type-property-groups-editor';

type Props = {
  entityId: string;
  spaceId: string;
};

export function TypeSchemaInline({ entityId, spaceId }: Props) {
  const types = useEntityTypes(entityId, spaceId);
  const isTypeEntity = types.some(type => type.id === SystemIds.SCHEMA_TYPE);
  const isEditing = useUserIsEditing(spaceId);

  if (!isTypeEntity) return null;

  return isEditing ? (
    <TypePropertyGroupsEditor entityId={entityId} spaceId={spaceId} />
  ) : (
    <TypeSchemaReadView entityId={entityId} spaceId={spaceId} />
  );
}

function TypeSchemaReadView({ entityId, spaceId }: Props) {
  const typePropertyRelations = sortRelations(
    useRelations({
      selector: relation =>
        relation.fromEntity.id === entityId && relation.spaceId === spaceId && relation.type.id === SystemIds.PROPERTIES,
    })
  );
  const typePropertyIds = React.useMemo(
    () => typePropertyRelations.map(relation => relation.toEntity.id),
    [typePropertyRelations]
  );
  const typePropertyIdSet = React.useMemo(() => new Set(typePropertyIds), [typePropertyIds]);

  const groupRelations = sortRelations(
    useRelations({
      selector: relation =>
        relation.fromEntity.id === entityId &&
        relation.spaceId === spaceId &&
        relation.type.id === PROPERTY_GROUPS_PROPERTY,
    })
  );
  const groupIds = React.useMemo(() => new Set(groupRelations.map(relation => relation.toEntity.id)), [groupRelations]);

  const groupPropertyRelations = useRelations({
    selector: relation =>
      relation.spaceId === spaceId && relation.type.id === SystemIds.PROPERTIES && groupIds.has(relation.fromEntity.id),
  });

  const groupNameValues = useValues({
    selector: value =>
      value.spaceId === spaceId && groupIds.has(value.entity.id) && value.property.id === SystemIds.NAME_PROPERTY,
  });

  const sections = React.useMemo(() => {
    const propertyNameById = new Map<string, string | null>();
    for (const relation of typePropertyRelations) {
      propertyNameById.set(relation.toEntity.id, relation.toEntity.name ?? null);
    }
    for (const relation of groupPropertyRelations) {
      if (!propertyNameById.has(relation.toEntity.id)) {
        propertyNameById.set(relation.toEntity.id, relation.toEntity.name ?? null);
      }
    }

    const groupNameById = new Map<string, string | null>();
    for (const value of groupNameValues) {
      groupNameById.set(value.entity.id, value.value);
    }

    const consumed = new Set<string>();
    const groups = groupRelations.map(groupRelation => {
      const groupId = groupRelation.toEntity.id;
      const propertyIds = sortRelations(
        groupPropertyRelations.filter(
          relation => relation.fromEntity.id === groupId && typePropertyIdSet.has(relation.toEntity.id)
        )
      )
        .map(relation => relation.toEntity.id)
        .filter(propertyId => {
          if (consumed.has(propertyId)) return false;
          consumed.add(propertyId);
          return true;
        });

      return {
        id: groupId,
        label: (groupNameById.get(groupId) ?? groupRelation.toEntity.name ?? '').trim() || 'Untitled group',
        propertyIds,
      };
    });

    const ungrouped = typePropertyIds.filter(propertyId => !consumed.has(propertyId));

    return { groups, ungrouped, propertyNameById };
  }, [groupNameValues, groupPropertyRelations, groupRelations, typePropertyIdSet, typePropertyIds, typePropertyRelations]);

  if (sections.groups.length === 0 && sections.ungrouped.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Text as="p" variant="tableCell" className="text-grey-04">
        Property groups
      </Text>
      <div className="flex flex-col gap-4 rounded-lg border border-grey-02 p-4 shadow-button">
        {sections.groups.map(group => (
          <div key={group.id} className="flex flex-col gap-2">
            <Text as="p" variant="metadataMedium" className="text-grey-04">
              {group.label}
            </Text>
            <div className="flex flex-wrap gap-2">
              {group.propertyIds.map(propertyId => (
                <LinkableRelationChip
                  key={`type-group-${group.id}-${propertyId}`}
                  isEditing={false}
                  currentSpaceId={spaceId}
                  entityId={propertyId}
                  small
                  truncateLabel
                >
                  {sections.propertyNameById.get(propertyId) ?? propertyId}
                </LinkableRelationChip>
              ))}
            </div>
          </div>
        ))}

        {sections.ungrouped.length > 0 && (
          <div className="flex flex-col gap-2">
            {sections.groups.length > 0 && (
              <Text as="p" variant="metadataMedium" className="text-grey-04">
                Ungrouped properties
              </Text>
            )}
            <div className="flex flex-wrap gap-2">
              {sections.ungrouped.map(propertyId => (
                <LinkableRelationChip
                  key={`type-ungrouped-${propertyId}`}
                  isEditing={false}
                  currentSpaceId={spaceId}
                  entityId={propertyId}
                  small
                  truncateLabel
                >
                  {sections.propertyNameById.get(propertyId) ?? propertyId}
                </LinkableRelationChip>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
