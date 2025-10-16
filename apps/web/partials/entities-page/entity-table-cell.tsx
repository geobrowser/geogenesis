import { SystemIds } from '@graphprotocol/grc-20';

import { Fragment } from 'react';

import { Source } from '~/core/blocks/data/source';
import { useRelations, useValue } from '~/core/sync/use-store';
import { Property } from '~/core/v2.types';

import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { CellContent } from '~/design-system/table/cell-content';

import type { onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';

type Props = {
  entityId: string;
  spaceId: string;
  property: Property;
  isExpanded: boolean;
  name: string | null;
  href: string;
  currentSpaceId: string;
  collectionId?: string;
  relationId?: string;
  verified?: boolean;
  onLinkEntry: onLinkEntryFn;
  source: Source;
};

export const EntityTableCell = ({
  entityId,
  spaceId,
  property,
  isExpanded,
  name,
  href,
  currentSpaceId,
  collectionId,
  relationId,
  verified,
  onLinkEntry,
  source,
}: Props) => {
  const isNameCell = property.id === SystemIds.NAME_PROPERTY;
  const isRelation = property.dataType === 'RELATION';

  if (isNameCell) {
    return (
      <Fragment key={entityId}>
        {source.type !== 'COLLECTION' ? (
          <Link entityId={entityId} href={href} className="text-tableCell text-ctaHover hover:underline">
            {name || entityId}
          </Link>
        ) : (
          <CollectionMetadata
            view="TABLE"
            isEditing={false}
            name={name}
            currentSpaceId={currentSpaceId}
            entityId={entityId}
            spaceId={spaceId}
            collectionId={collectionId}
            relationId={relationId}
            verified={verified}
            onLinkEntry={onLinkEntry}
          >
            <Link
              entityId={entityId}
              spaceId={spaceId}
              href={href}
              className="text-tableCell text-ctaHover hover:underline"
            >
              {name || entityId}
            </Link>
          </CollectionMetadata>
        )}
      </Fragment>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {isRelation ? (
        <RelationGroup entityId={entityId} property={property} spaceId={spaceId} />
      ) : (
        <ValueGroup entityId={entityId} property={property} spaceId={spaceId} isExpanded={isExpanded} />
      )}
    </div>
  );
};

type RelationGroupProps = {
  entityId: string;
  property: Property;
  spaceId: string;
};

function RelationGroup({ entityId, property, spaceId }: RelationGroupProps) {
  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.type.id === property.id,
  });

  return relations.map(relation => {
    if (property.renderableTypeStrict === 'IMAGE') {
      const value = relation.toEntity.value;
      return <ImageZoom key={value} variant="table-cell" imageSrc={value} />;
    }

    const value = relation.toEntity.value;
    const name = relation.toEntity.name;
    const relationId = relation.id;
    const relationValue = relation.toEntity.id;
    const relationEntityId = relation.entityId;

    return (
      <LinkableRelationChip
        key={relation.toEntity.value}
        isEditing={false}
        currentSpaceId={spaceId}
        entityId={relationValue}
        spaceId={relation.spaceId}
        relationId={relationId}
        relationEntityId={relationEntityId}
      >
        {name ?? value}
      </LinkableRelationChip>
    );
  });
}

type ValueGroupProps = {
  entityId: string;
  property: Property;
  spaceId: string;
  isExpanded?: boolean;
};

function ValueGroup({ entityId, property, spaceId, isExpanded }: ValueGroupProps) {
  const rawValue = useValue({
    selector: v => v.entity.id === entityId && v.property.id === property.id,
  });
  const value = rawValue?.value ?? '';
  const renderableType = property.renderableTypeStrict ?? property.dataType;

  if (renderableType === 'URL') {
    return <WebUrlField variant="tableCell" isEditing={false} key={value} spaceId={spaceId} value={value} />;
  }

  if (renderableType === 'TIME') {
    return <DateField variant="tableCell" isEditing={false} key={value} value={value} propertyId={property.id} />;
  }

  if (renderableType === 'CHECKBOX') {
    return <input type="checkbox" disabled key={`checkbox-${property.id}-${value}`} checked={value === '1'} />;
  }

  if (renderableType === 'NUMBER') {
    return (
      <NumberField
        variant="tableCell"
        isEditing={false}
        key={value}
        value={value}
        format={property.format || undefined}
        unitId={rawValue?.options?.unit || property.unit || undefined}
      />
    );
  }

  return <CellContent key={value} isExpanded={isExpanded} value={value} />;
}
