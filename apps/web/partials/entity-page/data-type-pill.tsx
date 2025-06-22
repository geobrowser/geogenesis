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
import { ColorName } from '~/design-system/theme/colors';
import { DataType } from '~/core/v2.types';

interface DataTypePillProps {
  dataType: DataType;
  dataTypeId?: string | null;
  renderableType?: string | null;
  spaceId: string;
}

// Hard-coded mapping of data type names to their entity UUIDs
const DATA_TYPE_MAPPING: Record<string, string> = {
  TEXT: '9edb6fcc-e454-4aa5-8611-39d7f024c010',
  NUMBER: '9b597aae-c31c-46c8-8565-a370da0c2a65', 
  CHECKBOX: '7aa4792e-eacd-4186-8272-fa7fc18298ac',
  TIME: 'ec8d6291-74f2-4289-b68e-09fcecfb1505',
  POINT: 'df250d17-e364-413d-9779-2ddaae841e34',
  RELATION: '4b6d9fc1-fbfe-474c-861c-83398e1b50d9',
};

// Icon mapping for data types
const DATA_TYPE_ICONS: Record<string, React.ComponentType<{ color?: ColorName }>> = {
  TEXT: Text,
  NUMBER: Number, 
  CHECKBOX: CheckboxChecked,
  TIME: Date,
  POINT: GeoLocation,
  RELATION: Relation,
};

export function DataTypePill({ 
  dataType, 
  dataTypeId,
  renderableType, 
  spaceId 
}: DataTypePillProps) {
  // Use dataTypeId if available, otherwise fall back to hard-coded mapping
  const targetId = dataTypeId || DATA_TYPE_MAPPING[dataType];
  const IconComponent = DATA_TYPE_ICONS[dataType];
  
  // Format data type: capitalize first letter of each word
  const formattedDataType = dataType
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  if (!targetId) {
    // If no mapping found, render as plain text
    return (
      <span className="inline-flex items-center gap-1 rounded border border-grey-02 bg-white px-1.5 py-0.5 text-metadata tabular-nums">
        {IconComponent && <IconComponent color="grey-04" />}
        <span>{formattedDataType}</span>
      </span>
    );
  }

  return (
    <Link
      href={NavUtils.toEntity(spaceId, targetId)}
      className="group inline-flex items-center gap-1 rounded border border-grey-02 bg-white pl-1.5 py-0.5 text-metadata tabular-nums hover:cursor-pointer hover:border-text hover:text-text focus:cursor-pointer focus:border-text focus:bg-ctaTertiary focus:text-text focus:shadow-inner-lg"
    >
      {IconComponent && <IconComponent color="grey-04" />}
      <span className="pr-1.5">{formattedDataType}</span>
    </Link>
  );
}