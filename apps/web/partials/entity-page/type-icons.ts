import * as React from 'react';

import { getStrictRenderableType } from '~/core/io/dto/properties';
import { SWITCHABLE_RENDERABLE_TYPE_LABELS, SwitchableRenderableType } from '~/core/types';

import { Address } from '~/design-system/icons/address';
import { CheckboxChecked } from '~/design-system/icons/checkbox-checked';
import { Date } from '~/design-system/icons/date';
import { GeoLocation } from '~/design-system/icons/geo-location';
import { Image } from '~/design-system/icons/image';
import { Number } from '~/design-system/icons/number';
import { Place } from '~/design-system/icons/place';
import { Point } from '~/design-system/icons/point';
import { Relation } from '~/design-system/icons/relation';
import { Text } from '~/design-system/icons/text';
import { Url } from '~/design-system/icons/url';
import { VideoSmall } from '~/design-system/icons/video-small';
import { ColorName } from '~/design-system/theme/colors';

export type TypeIconComponent = React.ComponentType<{ color?: ColorName; className?: string }>;

// Icon mapping for data types and renderable types
export const TYPE_ICONS: Record<SwitchableRenderableType, TypeIconComponent> = {
  TEXT: Text,
  INTEGER: Number,
  FLOAT: Number,
  DECIMAL: Number,
  BOOLEAN: CheckboxChecked,
  DATE: Date,
  DATETIME: Date,
  TIME: Date,
  POINT: Point,
  RELATION: Relation,
  URL: Url,
  IMAGE: Image,
  VIDEO: VideoSmall,
  GEO_LOCATION: GeoLocation,
  PLACE: Place,
  ADDRESS: Address,
};

const LABEL_TO_KEY: Record<string, SwitchableRenderableType> = Object.fromEntries(
  Object.entries(SWITCHABLE_RENDERABLE_TYPE_LABELS).map(([key, label]) => [
    label.toUpperCase(),
    key as SwitchableRenderableType,
  ])
) as Record<string, SwitchableRenderableType>;

export const resolveRenderableTypeKey = (
  name?: string | null,
  id?: string | null
): SwitchableRenderableType | undefined => {
  if (!name && id) {
    return getStrictRenderableType(id);
  }

  if (!name) return undefined;

  const upperName = name.toUpperCase().trim();
  if (upperName in TYPE_ICONS) {
    return upperName as SwitchableRenderableType;
  }

  return LABEL_TO_KEY[upperName];
};
