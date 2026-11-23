'use client';

import * as React from 'react';

import type { GraphEntity } from '~/core/graph-explorer/fetch-graph-hop';
import { getImagePath, isRenderableImageSrc } from '~/core/utils/utils';

export function entityImageSrc(entity: Pick<GraphEntity, 'image'>): string | null {
  if (!entity.image) return null;
  const src = getImagePath(entity.image);
  return isRenderableImageSrc(src) ? src : null;
}

export function EntityAvatar({ entity, size }: { entity: Pick<GraphEntity, 'image' | 'name'>; size: number }) {
  const src = entityImageSrc(entity);
  const [failed, setFailed] = React.useState(false);
  const initial = (entity.name ?? '?').trim().charAt(0).toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-grey-02 bg-grey-01 text-grey-04"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {src && !failed ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initial
      )}
    </span>
  );
}
