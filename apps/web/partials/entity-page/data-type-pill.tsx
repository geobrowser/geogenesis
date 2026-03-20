'use client';

import * as React from 'react';

import { DataType, RawRenderableType, SWITCHABLE_RENDERABLE_TYPE_LABELS, SwitchableRenderableType } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { TYPE_ICONS, resolveRenderableTypeKey } from './type-icons';

interface DataTypePillProps {
  dataType: DataType;
  renderableType?: {
    id: RawRenderableType | null;
    name: string | null;
  } | null;
  spaceId: string;
  iconOnly?: boolean;
}

export function DataTypePill({ dataType, renderableType, spaceId, iconOnly = false }: DataTypePillProps) {
  // Determine what to display
  const hasRenderableType = !!renderableType;
  const displayTypeName = renderableType?.name?.toUpperCase() || dataType;

  // Get the appropriate entity ID for linking
  let targetId: string | null = null;
  if (hasRenderableType && renderableType && renderableType.id) {
    // Use the renderable type entity ID directly if it's not null
    targetId = renderableType.id;
  }

  const renderableTypeKey = resolveRenderableTypeKey(renderableType?.name, renderableType?.id);
  const dataTypeKey = dataType in TYPE_ICONS ? (dataType as SwitchableRenderableType) : undefined;
  const iconKey = renderableTypeKey || dataTypeKey || 'TEXT';
  const IconComponent = TYPE_ICONS[iconKey];

  // Format display type: use SWITCHABLE_RENDERABLE_TYPE_LABELS if available, otherwise capitalize first letter of each word
  const formattedType = renderableTypeKey
    ? SWITCHABLE_RENDERABLE_TYPE_LABELS[renderableTypeKey]
    : dataTypeKey
      ? SWITCHABLE_RENDERABLE_TYPE_LABELS[dataTypeKey]
      : displayTypeName
          .toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

  // Determine if the pill should be clickable
  // Clickable only if we have a valid target ID
  const isClickable = !!targetId;

  if (iconOnly) {
    return (
      <span className="inline-flex items-center rounded border border-grey-02 bg-white p-1 text-metadata tabular-nums">
        {IconComponent && <IconComponent color="grey-04" />}
      </span>
    );
  }

  if (!isClickable) {
    // Non-clickable pill (data type only)
    return (
      <span className="inline-flex items-center gap-1 rounded border border-grey-02 bg-white px-1.5 py-px text-metadata tabular-nums">
        {IconComponent && <IconComponent color="grey-04" />}
        <span>{formattedType}</span>
      </span>
    );
  }

  // Clickable pill (renderable type with valid entity ID)
  return (
    <Link
      href={NavUtils.toEntity(spaceId, targetId!)}
      className="group inline-flex items-center gap-1 rounded border border-grey-02 bg-white py-px pl-1.5 text-metadata tabular-nums hover:cursor-pointer hover:border-text hover:text-text focus:cursor-pointer focus:border-text focus:bg-ctaTertiary focus:text-text focus:shadow-inner-lg"
    >
      {IconComponent && <IconComponent color="grey-04" />}
      <span className="pr-1.5">{formattedType}</span>
    </Link>
  );
}
