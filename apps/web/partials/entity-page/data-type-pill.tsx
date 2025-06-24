'use client';

import * as React from 'react';

import { NavUtils } from '~/core/utils/utils';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { CheckboxChecked } from '~/design-system/icons/checkbox-checked';
import { Date } from '~/design-system/icons/date';
import { GeoLocation } from '~/design-system/icons/geo-location';
import { Number } from '~/design-system/icons/number';
import { Relation } from '~/design-system/icons/relation';
import { Text } from '~/design-system/icons/text';
import { Url } from '~/design-system/icons/url';
import { Image } from '~/design-system/icons/image';
import { ColorName } from '~/design-system/theme/colors';
import { DataType, RenderableType } from '~/core/v2.types';

interface DataTypePillProps {
  dataType: DataType;
  dataTypeId?: string | null;
  renderableType?: {
    id: string;
    name: RenderableType
  } | null;
  spaceId: string;
}

// Icon mapping for data types and renderable types
const TYPE_ICONS: Record<string, React.ComponentType<{ color?: ColorName }>> = {
  TEXT: Text,
  NUMBER: Number, 
  CHECKBOX: CheckboxChecked,
  TIME: Date,
  POINT: GeoLocation,
  RELATION: Relation,
  URL: Url,
  IMAGE: Image,
};

export function DataTypePill({ 
  dataType, 
  dataTypeId,
  renderableType, 
  spaceId 
}: DataTypePillProps) {
  // Determine what to display
  const hasRenderableType = !!renderableType;
  const displayTypeName = renderableType?.name || dataType;
  
  // Get the appropriate entity ID for linking
  let targetId: string | undefined;
  if (hasRenderableType && renderableType) {
    // Use the renderable type entity ID directly
    targetId = renderableType.id;
  } else {
    // Use data type entity ID if provided
    targetId = dataTypeId || undefined;
  }
  
  // Get the appropriate icon - renderableType.name is already typed as RenderableType
  const iconKey = renderableType?.name || dataType;
  const IconComponent = TYPE_ICONS[iconKey];
  
  // Format display type: capitalize first letter of each word
  const formattedType = displayTypeName
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  // Determine if the pill should be clickable
  // Clickable only if we have a valid target ID
  const isClickable = !!targetId;
  
  if (!isClickable) {
    // Non-clickable pill (data type only)
    return (
      <span className="inline-flex items-center gap-1 rounded border border-grey-02 bg-white px-1.5 py-0.5 text-metadata tabular-nums">
        {IconComponent && <IconComponent color="grey-04" />}
        <span>{formattedType}</span>
      </span>
    );
  }

  // Clickable pill (renderable type with valid entity ID)
  return (
    <Link
      href={NavUtils.toEntity(spaceId, targetId!)}
      className="group inline-flex items-center gap-1 rounded border border-grey-02 bg-white pl-1.5 py-0.5 text-metadata tabular-nums hover:cursor-pointer hover:border-text hover:text-text focus:cursor-pointer focus:border-text focus:bg-ctaTertiary focus:text-text focus:shadow-inner-lg"
    >
      {IconComponent && <IconComponent color="grey-04" />}
      <span className="pr-1.5">{formattedType}</span>
    </Link>
  );
}