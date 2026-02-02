'use client';

import * as React from 'react';

import { NavUtils } from '~/core/utils/utils';
import {
  DataType,
  FlattenedRenderType,
  RawRenderableType,
  SWITCHABLE_RENDERABLE_TYPE_LABELS,
  SwitchableRenderableType,
} from '~/core/types';

import { CheckboxChecked } from '~/design-system/icons/checkbox-checked';
import { Date } from '~/design-system/icons/date';
import { GeoLocation } from '~/design-system/icons/geo-location';
import { Image } from '~/design-system/icons/image';
import { Number } from '~/design-system/icons/number';
import { Relation } from '~/design-system/icons/relation';
import { Text } from '~/design-system/icons/text';
import { Url } from '~/design-system/icons/url';
import { VideoSmall } from '~/design-system/icons/video-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { ColorName } from '~/design-system/theme/colors';

interface DataTypePillProps {
  dataType: DataType;
  renderableType?: {
    id: RawRenderableType | null;
    name: string | null;
  } | null;
  spaceId: string;
  iconOnly?: boolean;
}

// Type for all possible uppercase display types
type UppercaseDisplayType = Uppercase<FlattenedRenderType>;

// Icon mapping for data types and renderable types
const TYPE_ICONS: Record<UppercaseDisplayType, React.ComponentType<{ color?: ColorName }>> = {
  TEXT: Text,
  INT64: Number,
  FLOAT64: Number,
  DECIMAL: Number,
  BOOL: CheckboxChecked,
  DATE: Date,
  DATETIME: Date,
  TIME: Date,
  POINT: GeoLocation,
  RELATION: Relation,
  URL: Url,
  IMAGE: Image,
  VIDEO: VideoSmall,
  GEO_LOCATION: GeoLocation,
  PLACE: GeoLocation,
};

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

  // Get the appropriate icon - normalize the name to uppercase to match TYPE_ICONS keys
  const iconKey = (renderableType?.name?.toUpperCase() || dataType) as UppercaseDisplayType;

  // Safe lookup with fallback
  const IconComponent =
    iconKey in TYPE_ICONS
      ? TYPE_ICONS[iconKey]
      : TYPE_ICONS[dataType.toUpperCase() as UppercaseDisplayType] || TYPE_ICONS.TEXT;

  // Format display type: use SWITCHABLE_RENDERABLE_TYPE_LABELS if available, otherwise capitalize first letter of each word
  const upperDisplayType = displayTypeName.toUpperCase() as SwitchableRenderableType;
  const formattedType =
    SWITCHABLE_RENDERABLE_TYPE_LABELS[upperDisplayType] ||
    displayTypeName
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
      className="group inline-flex items-center gap-1 rounded border border-grey-02 bg-white py-0.5 pl-1.5 text-metadata tabular-nums hover:cursor-pointer hover:border-text hover:text-text focus:cursor-pointer focus:border-text focus:bg-ctaTertiary focus:text-text focus:shadow-inner-lg"
    >
      {IconComponent && <IconComponent color="grey-04" />}
      <span className="pr-1.5">{formattedType}</span>
    </Link>
  );
}
