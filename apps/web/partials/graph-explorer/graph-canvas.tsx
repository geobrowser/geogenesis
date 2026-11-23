'use client';

import * as React from 'react';

import type { GraphEntity } from '~/core/graph-explorer/fetch-graph-hop';
import type { Spoke } from '~/core/graph-explorer/spokes';
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

function useSize<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(current => (current.width === width && current.height === height ? current : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

const NODE_LABEL_MAX = 22;

function shortName(name: string) {
  return name.length > NODE_LABEL_MAX ? `${name.slice(0, NODE_LABEL_MAX - 1)}…` : name;
}

/** Spokes on an ellipse around the centre, sized to the container. Any count up to the cap. */
export function spokePositions(count: number, width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  // Leave room for a node's avatar and label at the edge.
  const rx = Math.max(0, width / 2 - 72);
  const ry = Math.max(0, height / 2 - 48);
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const x = cx + Math.cos(angle) * rx;
    const y = cy + Math.sin(angle) * ry;
    return { x, y, mx: cx + (x - cx) * 0.5, my: cy + (y - cy) * 0.5 };
  });
}

export function GraphCanvas({
  centre,
  spokes,
  onSelect,
  onPrefetch,
  emptyMessage,
}: {
  centre: Pick<GraphEntity, 'id' | 'name' | 'image'>;
  spokes: Spoke[];
  /** Spokes beyond the cap, listed in the Relationships tab. */
  onSelect: (spoke: Spoke) => void;
  onPrefetch: (entityId: string) => void;
  emptyMessage: string | null;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const positions = spokePositions(spokes.length, width, height);
  const ready = width > 0 && height > 0;

  return (
    <div ref={ref} className="relative h-full min-h-[300px] w-full overflow-hidden" data-testid="graph-canvas">
      {ready && (
        <svg className="absolute inset-0" width={width} height={height} aria-hidden>
          {positions.map((position, index) => (
            <line
              key={spokes[index].entity.id}
              x1={width / 2}
              y1={height / 2}
              x2={position.x}
              y2={position.y}
              className="stroke-grey-02"
              strokeWidth={1.5}
            />
          ))}
        </svg>
      )}

      {/* Too cramped on narrow screens; the Relationships tab lists the same labels. */}
      {ready &&
        positions.map((position, index) => (
          <span
            key={`label-${spokes[index].entity.id}`}
            className="pointer-events-none absolute max-w-[120px] -translate-x-1/2 -translate-y-1/2 truncate rounded bg-white px-1 text-footnote text-grey-04 lg:hidden"
            style={{ left: position.mx, top: position.my }}
          >
            {spokes[index].labels[0]}
          </span>
        ))}

      {ready &&
        positions.map((position, index) => {
          const spoke = spokes[index];
          const name = spoke.entity.name ?? spoke.entity.id;
          return (
            <button
              key={`node-${spoke.entity.id}`}
              type="button"
              className="absolute flex w-[124px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-lg p-1 text-center transition-colors hover:bg-grey-01 focus-visible:outline-2 focus-visible:outline-text"
              style={{ left: position.x, top: position.y }}
              title={`${name} (${spoke.labels.join(', ')})`}
              aria-label={`${name}, ${spoke.labels.join(', ')}. Centre the graph on it`}
              onClick={() => onSelect(spoke)}
              onMouseEnter={() => onPrefetch(spoke.entity.id)}
              onFocus={() => onPrefetch(spoke.entity.id)}
            >
              <EntityAvatar entity={spoke.entity} size={40} />
              <span className="text-metadataMedium leading-tight text-text">{shortName(name)}</span>
            </button>
          );
        })}

      {ready && (
        <div
          className="absolute flex w-[180px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 text-center"
          style={{ left: width / 2, top: height / 2 }}
        >
          <EntityAvatar entity={centre} size={64} />
          <span className="text-smallTitle leading-tight text-text">{centre.name ?? centre.id}</span>
        </div>
      )}

      {emptyMessage && (
        <p className="absolute right-4 bottom-4 left-4 text-center text-metadata text-grey-04" role="status">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
