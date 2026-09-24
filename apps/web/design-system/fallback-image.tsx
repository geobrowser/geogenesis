'use client';

import { GeoImage } from './geo-image';

type FallbackImageProps = {
  value: string;
  sizes: string;
  className?: string;
  priority?: boolean;
};

/**
 * Fill image that walks the gateway/optimizer fallback chain. Kept as a named entry point for the
 * callers that wrap it in a neutral placeholder; the loading behaviour lives in {@link GeoImage}.
 */
export function FallbackImage({ value, sizes, className, priority = false }: FallbackImageProps) {
  return <GeoImage value={value} alt="" fill sizes={sizes} className={className} priority={priority} />;
}
