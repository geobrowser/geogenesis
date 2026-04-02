import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';

export interface SpaceImageValueNode {
  propertyId: string;
  text: string | null;
}

export interface SpaceImageRelationNode {
  typeId: string;
  toEntity: {
    valuesList: SpaceImageValueNode[];
  } | null;
}

const toHex = (uuid: string) => uuid.replace(/-/g, '');

export const AVATAR_PROPERTY_ID = toHex(ContentIds.AVATAR_PROPERTY);
export const COVER_PROPERTY_ID = toHex(SystemIds.COVER_PROPERTY);
export const IMAGE_URL_PROPERTY_ID = toHex(SystemIds.IMAGE_URL_PROPERTY);

export function resolveSpaceImage(relations: SpaceImageRelationNode[]): string {
  const avatar = relations.find(r => r.typeId === AVATAR_PROPERTY_ID);
  const avatarUrl = avatar?.toEntity?.valuesList.find(v => v.propertyId === IMAGE_URL_PROPERTY_ID)?.text;

  if (avatarUrl) return avatarUrl;

  const cover = relations.find(r => r.typeId === COVER_PROPERTY_ID);
  const coverUrl = cover?.toEntity?.valuesList.find(v => v.propertyId === IMAGE_URL_PROPERTY_ID)?.text;

  if (coverUrl) return coverUrl;

  return PLACEHOLDER_SPACE_IMAGE;
}
