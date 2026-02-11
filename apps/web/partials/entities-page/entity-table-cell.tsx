'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';

import { Fragment } from 'react';

import { Source } from '~/core/blocks/data/source';
import { useRelations, useValue } from '~/core/sync/use-store';
import { Property } from '~/core/types';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { usePropertyFormat } from '~/core/hooks/use-property-format';

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
          <Link
            entityId={entityId}
            href={href}
            className="break-words text-tableCell text-ctaHover hover:underline"
          >
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
              className="break-words text-tableCell text-ctaHover hover:underline"
            >
              {name || entityId}
            </Link>
          </CollectionMetadata>
        )}
      </Fragment>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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
      return (
        <ImageRelation
          key={relation.id}
          linkedEntityId={relation.toEntity.id}
          directImageUrl={relation.toEntity.value}
          spaceId={spaceId}
        />
      );
    }

    const value = relation.toEntity.value;
    const name = relation.toEntity.name;
    const relationId = relation.id;
    const relationValue = relation.toEntity.id;

    return (
      <LinkableRelationChip
        small
        key={relation.toEntity.value}
        isEditing={false}
        currentSpaceId={spaceId}
        entityId={relationValue}
        spaceId={relation.spaceId}
        relationId={relationId}
      >
        {name ?? value}
      </LinkableRelationChip>
    );
  });
}

function ImageRelation({
  linkedEntityId,
  directImageUrl,
  spaceId,
}: {
  linkedEntityId: string;
  directImageUrl?: string | null;
  spaceId: string;
}) {
  // For published data, directImageUrl (from toEntity.value) contains the IPFS URL directly
  // For unpublished data, directImageUrl contains the entity ID (UUID), not a URL
  // We need to check if it's a valid image URL before using it
  const isValidImageUrl = directImageUrl && (directImageUrl.startsWith('ipfs://') || directImageUrl.startsWith('http'));
  const lookedUpImageSrc = useImageUrlFromEntity(linkedEntityId, spaceId);
  const imageSrc = isValidImageUrl ? directImageUrl : lookedUpImageSrc;

  return <ImageZoom variant="table-cell" imageSrc={imageSrc || ''} />;
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

  const { hasUrlTemplate, resolveUrl } = usePropertyFormat(property.id, spaceId);
  const resolvedUrl = hasUrlTemplate ? resolveUrl(value) : undefined;

  if (renderableType === 'URL') {
    return (
      <WebUrlField
        variant="tableCell"
        isEditing={false}
        key={value}
        spaceId={spaceId}
        value={value}
        resolvedUrl={resolvedUrl}
      />
    );
  }

  if (renderableType === 'DATE' || renderableType === 'DATETIME' || renderableType === 'TIME') {
    return <DateField variant="tableCell" isEditing={false} key={value} value={value} propertyId={property.id} dataType={property.dataType} />;
  }

  if (renderableType === 'BOOL') {
    return <input type="checkbox" disabled key={`checkbox-${property.id}-${value}`} checked={value === '1'} />;
  }

  if (renderableType === 'INT64' || renderableType === 'FLOAT64' || renderableType === 'DECIMAL') {
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

  if (renderableType === 'TEXT' && hasUrlTemplate) {
    return (
      <WebUrlField
        variant="tableCell"
        isEditing={false}
        key={value}
        spaceId={spaceId}
        value={value}
        resolvedUrl={resolvedUrl}
      />
    );
  }

  return <CellContent key={value} isExpanded={isExpanded} value={value} />;
}
