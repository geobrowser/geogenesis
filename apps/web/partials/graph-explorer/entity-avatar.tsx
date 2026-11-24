'use client';

import * as React from 'react';

import type { GraphEntity } from '~/core/graph-explorer/graph-entity';
import { getImagePath, isRenderableImageSrc } from '~/core/utils/utils';

/** A gateway URL for an image value, or null when it is empty or cannot render as a picture. */
export function renderableImageSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  const src = getImagePath(value);
  return isRenderableImageSrc(src) ? src : null;
}

export function entityImageSrc(entity: Pick<GraphEntity, 'image'>): string | null {
  return renderableImageSrc(entity.image);
}

/** A debate's share card, when it has one that can render. */
export function entityCardSrc(entity: Pick<GraphEntity, 'card'>): string | null {
  return renderableImageSrc(entity.card);
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
