'use client';

import * as React from 'react';
import { useRef, useState } from 'react';

import { IMAGE_ACCEPT } from '~/core/constants';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';
import { Checkbox, getChecked } from '~/design-system/checkbox';
import { SmallButton } from '~/design-system/button';
import { DateField } from '~/design-system/editable-fields/date-field';
import {
  TableImageField,
  TableStringField,
} from '~/design-system/editable-fields/editable-fields';
import { NumberField } from '~/design-system/editable-fields/number-field';
import { WebUrlField } from '~/design-system/editable-fields/web-url-field';
import { NativeGeoImage } from '~/design-system/geo-image';
import { Dots } from '~/design-system/dots';
import { Upload } from '~/design-system/icons/upload';
import {
  SelectEntityCompact,
  type SelectEntityCompactResult,
} from '~/design-system/select-entity-compact';

import type { Property, Relation } from '~/core/types';
import { useQueryProperty } from '~/core/sync/use-store';

export type EditableEntityValueFieldProps = {
  property: Property;
  spaceId: string;
  value?: string;
  onChange?: (value: string) => void;
  unitId?: string;
  selectedEntities?: SelectEntityCompactResult[];
  onRemoveSelectedEntity?: (id: string) => void;
  onSelectEntity?: (result: SelectEntityCompactResult) => void;

  entityId?: string;
  entityName?: string | null;
  imageRelation?: Relation | undefined;

  onUploadImage?: (file: File) => Promise<SelectEntityCompactResult>;

  selectedImageFile?: File | null;
  onImageFileSelect?: (file: File) => void;
  onImageFileClear?: () => void;

  onBeforeImageFileDialogOpen?: () => void;
  onAfterImageFileDialogClose?: () => void;
};

function isRelationProperty(property: Property): boolean {
  return (
    property.dataType === 'RELATION' ||
    Boolean(property.relationValueTypes && property.relationValueTypes.length > 0)
  );
}

function ImageUploadButton({
  onUpload,
}: {
  onUpload: (file: File) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await onUpload(file);
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <SmallButton
        onClick={() => inputRef.current?.click()}
        icon={isUploading ? <Dots /> : <Upload />}
      >
        {isUploading ? 'Uploading...' : 'Load image'}
      </SmallButton>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={handleChange}
        disabled={isUploading}
      />
    </>
  );
}

function ImageFileSelectButton({
  onSelect,
  onBeforeFileDialogOpen,
  onAfterFileDialogClose,
}: {
  onSelect: (file: File) => void;
  /** Call before opening the file dialog (e.g. so parent can prevent popover close). */
  onBeforeFileDialogOpen?: () => void;
  /** Call after file selection or dialog close. */
  onAfterFileDialogClose?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelect(file);
      if (inputRef.current) inputRef.current.value = '';
    }
    onAfterFileDialogClose?.();
  };
  const handleButtonClick = () => {
    onBeforeFileDialogOpen?.();
    inputRef.current?.click();
  };
  return (
    <>
      <SmallButton onClick={handleButtonClick} icon={<Upload />}>
        Load image
      </SmallButton>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}

function TemporaryImagePreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove?: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!objectUrl) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-12 shrink-0 overflow-hidden rounded-md border border-grey-02">
        <img src={objectUrl} alt="" className="size-full object-cover" />
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-button text-[0.8125rem] text-grey-04 hover:underline"
        >
          Remove
        </button>
      )}
    </div>
  );
}

function InitialImagePreview({
  imageEntityId,
  spaceId,
  onRemove,
}: {
  imageEntityId: string;
  spaceId: string;
  onRemove?: () => void;
}) {
  const imageSrc = useImageUrlFromEntity(imageEntityId, spaceId);
  if (!imageSrc) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-12 shrink-0 overflow-hidden rounded-md border border-grey-02">
        <NativeGeoImage value={imageSrc} alt="" className="size-full object-cover" />
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-button text-[0.8125rem] text-grey-04 hover:underline"
        >
          Remove
        </button>
      )}
    </div>
  );
}

export function EditableEntityValueField({
  property,
  spaceId,
  value = '',
  onChange,
  unitId: unitIdProp,
  selectedEntities = [],
  onRemoveSelectedEntity,
  onSelectEntity,
  entityId,
  entityName,
  imageRelation,
  onUploadImage,
  selectedImageFile,
  onImageFileSelect,
  onImageFileClear,
  onBeforeImageFileDialogOpen,
  onAfterImageFileDialogClose,
}: EditableEntityValueFieldProps) {
  const isRelation = isRelationProperty(property);
  const isImageType = property.renderableTypeStrict === 'IMAGE';

  const { property: resolvedProperty } = useQueryProperty({
    id: isRelation && !isImageType && property.id ? property.id : undefined,
    enabled: isRelation && !isImageType && Boolean(property.id),
  });
  const relationValueTypes =
    property.relationValueTypes?.length ? property.relationValueTypes : resolvedProperty?.relationValueTypes;
  const filterByTypeIds = relationValueTypes?.length
    ? relationValueTypes.map(r => ({ id: r.id }))
    : undefined;

  if (isRelation && !isImageType && onSelectEntity) {
    return (
      <SelectEntityCompact
        spaceId={spaceId}
        selected={selectedEntities}
        onRemoveSelected={onRemoveSelectedEntity}
        onDone={onSelectEntity}
        relationValueTypes={filterByTypeIds}
      />
    );
  }

  if (isRelation && !isImageType) {
    return null;
  }

  const renderableType = property.renderableTypeStrict ?? property.dataType;

  if (renderableType === 'IMAGE' && entityId != null) {
    const valueFieldBorderClass =
      'w-full rounded-md border border-grey-02 bg-white shadow-inner shadow-grey-02';
    return (
      <div
        className={`${valueFieldBorderClass} px-2 py-1.5 min-h-[2.25rem] flex items-center`}
      >
        <TableImageField
          imageRelation={imageRelation}
          spaceId={spaceId}
          entityId={entityId}
          entityName={entityName ?? undefined}
          propertyId={property.id}
          propertyName={property.name ?? 'Image'}
        />
      </div>
    );
  }

  if (renderableType === 'IMAGE' && onImageFileSelect) {
    const valueFieldBorderClass =
      'w-full rounded-md border border-grey-02 bg-white shadow-inner shadow-grey-02';
    return (
      <div
        className={`${valueFieldBorderClass} flex flex-col`}
      >
        <ImageFileSelectButton
          onSelect={onImageFileSelect}
          onBeforeFileDialogOpen={onBeforeImageFileDialogOpen}
          onAfterFileDialogClose={onAfterImageFileDialogClose}
        />
        {selectedImageFile && (
          <TemporaryImagePreview
            file={selectedImageFile}
            onRemove={onImageFileClear}
          />
        )}
      </div>
    );
  }

  if (renderableType === 'IMAGE' && onSelectEntity && onUploadImage) {
    const valueFieldBorderClass =
      'w-full rounded-md border border-grey-02 bg-white shadow-inner shadow-grey-02';
    return (
      <div
        className={`${valueFieldBorderClass} px-2 py-1.5 min-h-[2.25rem] flex flex-col gap-2`}
      >
        <ImageUploadButton
          onUpload={async (file: File) => {
            const result = await onUploadImage(file);
            onSelectEntity(result);
          }}
        />
        {selectedEntities.length > 0 && (
          <InitialImagePreview
            imageEntityId={selectedEntities[0].id}
            spaceId={spaceId}
            onRemove={
              selectedEntities.length > 0 && onRemoveSelectedEntity
                ? () => onRemoveSelectedEntity(selectedEntities[0].id)
                : undefined
            }
          />
        )}
      </div>
    );
  }

  if (renderableType === 'IMAGE' && onSelectEntity) {
    const valueFieldBorderClass =
      'w-full rounded-md border border-grey-02 bg-white shadow-inner shadow-grey-02';
    return (
      <div
        className={`${valueFieldBorderClass} px-2 py-1.5 min-h-[2.25rem] flex items-center`}
      >
        <SelectEntityCompact
          spaceId={spaceId}
          selected={selectedEntities}
          onRemoveSelected={onRemoveSelectedEntity}
          onDone={onSelectEntity}
          relationValueTypes={property.relationValueTypes}
        />
      </div>
    );
  }

  if (renderableType === 'IMAGE') {
    const valueFieldBorderClass =
      'w-full rounded-md border border-grey-02 bg-white shadow-inner shadow-grey-02';
    return (
      <div
        className={`${valueFieldBorderClass} px-2 py-1.5 min-h-[2.25rem] flex items-center text-[0.8125rem] text-grey-04`}
      >
        Images can be set per row after adding the property.
      </div>
    );
  }

  const unitId = unitIdProp ?? property.unit ?? undefined;
  const handleChange = onChange ?? (() => {});

  const valueFieldBorderClass =
    'w-full rounded-md border border-grey-02 bg-white shadow-inner shadow-grey-02';

  let content: React.ReactNode;
  switch (renderableType) {
    case 'INTEGER':
    case 'FLOAT':
    case 'DECIMAL':
      content = (
        <NumberField
          variant="tableCell"
          isEditing={true}
          value={value}
          format={property.format || undefined}
          unitId={unitId}
          dataType={property.dataType}
          onChange={handleChange}
        />
      );
      break;
    case 'TEXT':
      content = (
        <TableStringField
          placeholder="Add value..."
          value={value}
          onChange={handleChange}
        />
      );
      break;
    case 'URL':
      content = (
        <WebUrlField
          variant="tableCell"
          isEditing={true}
          spaceId={spaceId}
          value={value}
          format={property.format}
          onBlur={e => handleChange(e.currentTarget.value)}
        />
      );
      break;
    case 'BOOLEAN': {
      const checked = getChecked(value);
      content = (
        <Checkbox
          checked={checked}
          onChange={() => handleChange(!checked ? '1' : '0')}
        />
      );
      break;
    }
    case 'DATE':
    case 'DATETIME':
    case 'TIME':
      content = (
        <DateField
          isEditing={true}
          value={value}
          propertyId={property.id}
          dataType={property.dataType}
          onBlur={v => handleChange(v.value)}
        />
      );
      break;
    default:
      content = (
        <TableStringField
          placeholder="Add value..."
          value={value}
          onChange={handleChange}
        />
      );
  }

  return (
    <div className={`${valueFieldBorderClass} px-2 py-1.5 min-h-[2.25rem] flex items-center`}>
      {content}
    </div>
  );
}
