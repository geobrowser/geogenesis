'use client';

import { type ReactNode, useState } from 'react';

import cx from 'classnames';

import { Source } from '~/core/blocks/data/source';
import { useRelationTargetTypeIds } from '~/core/hooks/use-relation-target-type-ids';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useMutate } from '~/core/sync/use-mutate';
import { useRelations, useSpaceAwareValue } from '~/core/sync/use-store';
import { Property } from '~/core/types';
import { isUrlTemplate } from '~/core/utils/url-template';

import { SquareButton } from '~/design-system/button';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { LinkableRelationChip } from '~/design-system/chip';
import { DateField } from '~/design-system/editable-fields/date-field';
import { TableImageField, TableStringField } from '~/design-system/editable-fields/editable-fields';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { Create } from '~/design-system/icons/create';
import { SelectEntity } from '~/design-system/select-entity';
import { SelectEntityAsPopover } from '~/design-system/select-entity-dialog';

import { createPropertyRelation, createTypeRelationForNewEntity, onChangeEntryFn, writeValue } from './change-entry';
import { LIST_GALLERY_BROWSE_BODY_CLASS } from './table-block-browse-layout';

/** Match description tokens in list/gallery browse (overrides tableCell / tableProperty on inner elements). */
const BROWSE_LIST_VALUE_CLASS =
  '!text-[length:var(--text-listItem)] !leading-[length:var(--text-listItem--line-height)] !font-normal !text-grey-04 !text-left';

const BROWSE_LIST_URL_CLASS =
  '!text-[length:var(--text-listItem)] !leading-[length:var(--text-listItem--line-height)] !font-normal !text-ctaPrimary hover:!text-ctaHover !text-left break-all';

function BrowsePropertyLabel({ name }: { name: string }) {
  return <div className="mb-0.5 text-footnote text-grey-04">{name}</div>;
}

export function TableBlockPropertyField(props: {
  spaceId: string;
  entityId: string;
  property: Property;
  onChangeEntry: onChangeEntryFn;
  source: Source;
  disableLink?: boolean;
  entityName?: string | null;
  /** List/gallery browse: unify value typography with description; relations use chips. */
  browseListBody?: boolean;
}) {
  const { spaceId, entityId, property, source, disableLink = false, entityName, browseListBody = false } = props;
  const isEditing = useUserIsEditing(props.spaceId);
  const isRelation = property.dataType === 'RELATION';

  if (isEditing && source.type !== 'RELATIONS') {
    if (isRelation) {
      return (
        <div className="space-y-1">
          <div className="text-metadata text-grey-04">{property.name}</div>
          <EditableRelationsGroup
            entityId={entityId}
            spaceId={spaceId}
            property={property}
            disableLink={disableLink}
            entityName={entityName}
            isEditing={isEditing}
          />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-metadata text-grey-04">{property.name}</div>
          <div className="flex w-full flex-wrap gap-2">
            <EditableValueGroup entityId={entityId} property={property} spaceId={spaceId} isEditing={isEditing} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cx('flex flex-wrap gap-x-2', !isRelation && 'w-full min-w-0')}>
      <RenderedProperty
        entityId={entityId}
        property={property}
        spaceId={spaceId}
        disableLink={disableLink}
        browseListBody={browseListBody}
      />
    </div>
  );
}

type PropertyProps = {
  entityId: string;
  property: Property;
  spaceId: string;
  className?: string;
  disableLink?: boolean;
  browseListBody?: boolean;
};

const RenderedProperty = ({
  entityId,
  property,
  spaceId,
  disableLink = false,
  browseListBody = false,
}: PropertyProps) => {
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const isRelation = property.dataType === 'RELATION';

  if (property.renderableType === 'IMAGE') {
    // We don't support rendering images in list or gallery views except the main image
    return null;
  }

  // List/gallery browse shows an always-on label, so the hover tooltip is redundant there.
  const browseLabel = browseListBody ? property.name : undefined;

  return (
    <div
      className={cx(
        'relative',
        browseListBody
          ? // List/gallery browse: parent `space-y-*` / `gap-*` owns vertical rhythm; no extra top margin.
            isRelation
            ? 'block w-full'
            : 'block w-full min-w-0'
          : // Table / other: small top offset so values sit comfortably in the cell.
            isRelation
            ? 'mt-2 inline-block'
            : 'mt-1 block w-full min-w-0'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!browseListBody && (
        <div className="absolute top-0 right-0 -translate-y-full pb-1">
          <div
            className={cx(
              'rounded-sm bg-black p-1 text-footnoteMedium text-white duration-300 ease-in-out',
              isHovered ? 'opacity-100 delay-700' : 'opacity-0'
            )}
          >
            {property.name}
          </div>
        </div>
      )}
      {isRelation ? (
        <EditableRelationsGroup
          entityId={entityId}
          spaceId={spaceId}
          property={property}
          disableLink={disableLink}
          isEditing={false}
          browseLabel={browseLabel}
        />
      ) : (
        <EditableValueGroup
          entityId={entityId}
          property={property}
          spaceId={spaceId}
          isEditing={false}
          disableLink={disableLink}
          browseListTypography={browseListBody}
          browseLabel={browseLabel}
        />
      )}
    </div>
  );
};

type EditableRelationsGroupProps = {
  spaceId: string;
  entityId: string;
  property: Property;
  disableLink?: boolean;
  entityName?: string | null;
  isEditing: boolean;
  /** List/gallery browse: tiny label rendered above the relation chips. */
  browseLabel?: string | null;
};

function EditableRelationsGroup({
  entityId,
  spaceId,
  property,
  disableLink = false,
  entityName,
  isEditing,
  browseLabel,
}: EditableRelationsGroupProps) {
  const { storage } = useMutate();

  const typeOfId = property.id;
  const { relationValueTypes, waitForFilterTypes } = useRelationTargetTypeIds({
    propertyId: property.id,
    spaceId,
    relationValueTypes: property.relationValueTypes,
  });
  const filterSearchByTypes = relationValueTypes ?? [];
  const firstRelationValueType = relationValueTypes?.[0];

  // We don't filter by space id as we want to render data from all spaces.
  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.type.id === typeOfId,
  });

  const isEmpty = relations.length === 0;

  // For IMAGE type properties, show an image upload field
  if (property.renderableTypeStrict === 'IMAGE') {
    return (
      <TableImageField
        imageRelation={relations[0]}
        spaceId={spaceId}
        entityId={entityId}
        entityName={entityName}
        propertyId={property.id}
        propertyName={property.name ?? 'Image'}
      />
    );
  }

  if (isEmpty) {
    if (!isEditing) {
      return null;
    }
    return (
      <div data-testid="select-entity" className="w-full">
        <SelectEntity
          spaceId={spaceId}
          relationValueTypes={filterSearchByTypes}
          waitForFilterTypes={waitForFilterTypes}
          restrictToFilterTypes={Boolean(filterSearchByTypes.length)}
          onCreateEntity={result => {
            if (firstRelationValueType) {
              createTypeRelationForNewEntity(storage, spaceId, result, firstRelationValueType);
            }
          }}
          onDone={result => {
            createPropertyRelation(storage, spaceId, entityId, property, result);
          }}
          variant="tableCell"
        />
      </div>
    );
  }

  return (
    <>
      {browseLabel && <BrowsePropertyLabel name={browseLabel} />}
      <div className="flex flex-wrap items-center gap-2">
        {relations.map(r => {
          const relationId = r.id;
          const relationName = r.toEntity.name;
          const relationValue = r.toEntity.value;

          return (
            <div key={`relation-${relationId}-${relationValue}`}>
              <LinkableRelationChip
                isEditing={isEditing}
                onDelete={() => {
                  storage.relations.delete(r);
                }}
                onDone={result => {
                  storage.relations.update(r, draft => {
                    draft.toSpaceId = result.space;
                    draft.verified = result.verified;
                  });
                }}
                currentSpaceId={spaceId}
                entityId={relationValue}
                relationId={relationId}
                relationEntityId={r.entityId}
                spaceId={r.toSpaceId}
                verified={r.verified}
                small
                disableLink={disableLink}
              >
                {relationName ?? relationValue}
              </LinkableRelationChip>
            </div>
          );
        })}
        {!isEmpty && isEditing && (
          <div className="mt-2">
            <SelectEntityAsPopover
              trigger={<SquareButton icon={<Create />} />}
              relationValueTypes={filterSearchByTypes}
              waitForFilterTypes={waitForFilterTypes}
              restrictToFilterTypes={Boolean(filterSearchByTypes.length)}
              onCreateEntity={result => {
                if (firstRelationValueType) {
                  createTypeRelationForNewEntity(storage, spaceId, result, firstRelationValueType);
                }
              }}
              onDone={result => {
                createPropertyRelation(storage, spaceId, entityId, property, result);
              }}
              spaceId={spaceId}
            />
          </div>
        )}
      </div>
    </>
  );
}

type EditableValueGroupProps = {
  entityId: string;
  property: Property;
  spaceId: string;
  isEditing: boolean;
  /** Render URL values as plain text — the whole list item is already a link, and nested <a> is invalid HTML. */
  disableLink?: boolean;
  /** List/gallery browse: match description (`text-metadata` / tableProperty) instead of table cell scale. */
  browseListTypography?: boolean;
  /** List/gallery browse: tiny label rendered above the value (only when there's a value to show). */
  browseLabel?: string | null;
};

function EditableValueGroup({
  entityId,
  property,
  spaceId,
  isEditing,
  disableLink = false,
  browseListTypography = false,
  browseLabel,
}: EditableValueGroupProps) {
  const { storage } = useMutate();
  const rawValue = useSpaceAwareValue({ entityId, propertyId: property.id, spaceId });

  // Match entity-table-cell / editable-entity-table-cell: `renderableType` is often a UUID;
  // fall back to dataType so DATE/DATETIME/TEXT/etc. resolve correctly.
  const renderableType = property.renderableTypeStrict ?? property.dataType;
  const value = rawValue?.value ?? '';

  const onWriteValue = (newValue: string) => {
    writeValue(storage, entityId, spaceId, property, newValue, rawValue);
  };

  const compactBrowse = browseListTypography && !isEditing;

  // Attach the browse label above the value, but only when there's content (`show`) so empty cells don't show orphan labels.
  const withLabel = (node: ReactNode, show: boolean = Boolean(value)) =>
    browseLabel && show ? (
      <>
        <BrowsePropertyLabel name={browseLabel} />
        {node}
      </>
    ) : (
      node
    );

  // List/gallery browse: always key off `dataType` for TEXT so Summary/long text never hits `case 'URL'`
  // or other renderable branches with larger tableCell styles.
  if (compactBrowse && property.dataType === 'TEXT') {
    if (!value) return null;
    if (isUrlTemplate(property.format) || property.renderableTypeStrict === 'URL') {
      return withLabel(
        <WebUrlField
          variant="tableCell"
          isEditing={false}
          spaceId={spaceId}
          value={value}
          format={property.format}
          disableLink={disableLink}
          className={BROWSE_LIST_URL_CLASS}
        />
      );
    }
    return withLabel(
      <p className={cx(LIST_GALLERY_BROWSE_BODY_CLASS, 'wrap-break-word whitespace-pre-wrap')}>{value}</p>
    );
  }

  switch (renderableType) {
    case 'INTEGER':
    case 'FLOAT':
    case 'DECIMAL':
      return withLabel(
        <NumberField
          variant="tableCell"
          value={value}
          format={property.format || undefined}
          unitId={rawValue?.options?.unit || property.unit || undefined}
          isEditing={isEditing}
          dataType={property.dataType}
          onChange={onWriteValue}
          className={compactBrowse ? BROWSE_LIST_VALUE_CLASS : undefined}
        />
      );
    case 'TEXT':
      return <TableStringField variant="tableCell" placeholder="Add value..." value={value} onChange={onWriteValue} />;
    case 'URL':
      return withLabel(
        <WebUrlField
          variant="tableCell"
          isEditing={isEditing}
          spaceId={spaceId}
          value={value}
          format={property.format}
          onBlur={isEditing ? e => onWriteValue(e.currentTarget.value) : undefined}
          disableLink={disableLink}
          className={compactBrowse ? BROWSE_LIST_URL_CLASS : undefined}
        />
      );
    case 'BOOLEAN': {
      const checked = getChecked(value);
      return withLabel(<Checkbox checked={checked} onChange={() => onWriteValue(!checked ? '1' : '0')} />, true);
    }
    case 'DATE':
    case 'DATETIME':
    case 'TIME':
      return withLabel(
        <DateField
          variant="tableCell"
          key={value || 'empty'}
          isEditing={isEditing}
          value={value}
          propertyId={property.id}
          dataType={property.dataType}
          onBlur={isEditing ? v => onWriteValue(v.value) : undefined}
          className={compactBrowse ? BROWSE_LIST_VALUE_CLASS : undefined}
        />
      );
    default:
      return null;
  }
}
