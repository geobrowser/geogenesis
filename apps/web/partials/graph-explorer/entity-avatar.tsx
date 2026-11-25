'use client';

import * as React from 'react';

import type { GraphEntity } from '~/core/graph-explorer/graph-entity';
import { getImagePath, isRenderableImageSrc } from '~/core/utils/utils';

export function entityImageSrc(entity: Pick<GraphEntity, 'image'>): string | null {
  if (!entity.image) return null;
  const src = getImagePath(entity.image);
  return isRenderableImageSrc(src) ? src : null;
}

/**
 * The centre's picture beside its name: the prototype's 56px rounded square. No picture, or one that
 * fails to load, draws nothing rather than a blank or lettered circle.
 */
export function EntityAvatar({ entity }: { entity: Pick<GraphEntity, 'image'> }) {
  const src = entityImageSrc(entity);
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  if (!src || failedSrc === src) return null;
  return (
    <img
      src={src}
      alt=""
      className="h-14 w-14 shrink-0 rounded-[12px] bg-grey-01 object-cover"
      onError={() => setFailedSrc(src)}
    />
  );
}
