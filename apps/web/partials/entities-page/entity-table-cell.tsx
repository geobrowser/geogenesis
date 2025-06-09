import { SystemIds } from '@graphprotocol/grc-20';
import Link from 'next/link';

import { Fragment } from 'react';

import { Source } from '~/core/blocks/data/source';
import { RenderableProperty } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';

import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { ImageZoom } from '~/design-system/editable-fields/editable-fields';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { CellContent } from '~/design-system/table/cell-content';

import type { onLinkEntryFn } from '~/partials/blocks/table/change-entry';
import { CollectionMetadata } from '~/partials/blocks/table/collection-metadata';

type Props = {
  entityId: string;
  spaceId: string;
  columnId: string;
  renderables: RenderableProperty[];
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
  columnId,
  renderables,
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
  const isNameCell = columnId === SystemIds.NAME_ATTRIBUTE;

  if (isNameCell) {
    return (
      <Fragment key={entityId}>
        {source.type !== 'COLLECTION' ? (
          <Link href={href} className="text-tableCell text-ctaHover hover:underline">
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
            <Link href={href} className="text-tableCell text-ctaHover hover:underline">
              {name || entityId}
            </Link>
          </CollectionMetadata>
        )}
      </Fragment>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {renderables.map(renderable => {
        if (renderable.type === 'IMAGE') {
          const value = renderable.value;
          return <ImageZoom key={value} variant="table-cell" imageSrc={getImagePath(value)} />;
        }

        if (renderable.type === 'RELATION') {
          const value = renderable.value;
          const name = renderable.valueName;
          const relationId = renderable.relationId;
          const relationValue = renderable.value;

          return (
            <LinkableRelationChip
              key={value}
              isEditing={false}
              currentSpaceId={spaceId}
              entityId={relationValue}
              spaceId={renderable.spaceId}
              relationId={relationId}
            >
              {name ?? value}
            </LinkableRelationChip>
          );
        }

        if (renderable.type === 'URL') {
          return (
            <WebUrlField
              variant="tableCell"
              isEditing={false}
              key={renderable.value}
              spaceId={spaceId}
              value={renderable.value}
            />
          );
        }

        if (renderable.type === 'TIME') {
          return (
            <DateField
              variant="tableCell"
              isEditing={false}
              key={renderable.value}
              value={renderable.value}
              format={renderable.options?.format}
            />
          );
        }
        if (renderable.type === 'CHECKBOX') {
          return (
            <input
              type="checkbox"
              disabled
              key={`checkbox-${renderable.attributeId}-${renderable.value}`}
              checked={renderable.value === '1'}
            />
          );
        }

        if (renderable.type === 'NUMBER') {
          return (
            <NumberField
              variant="tableCell"
              isEditing={false}
              key={renderable.value}
              value={renderable.value}
              format={renderable.options?.format}
              unitId={renderable.options?.unit}
            />
          );
        }

        return <CellContent key={renderable.value} isExpanded={isExpanded} value={renderable.value} />;
      })}
    </div>
  );
};
