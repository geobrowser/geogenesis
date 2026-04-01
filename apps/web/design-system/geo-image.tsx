'use client';

import type { ImgHTMLAttributes } from 'react';

import Image, { ImageProps } from 'next/image';

import { getImagePath } from '~/core/utils/utils';

/**
 * Default responsive sizes for Next.js Image components with fill prop.
 * Matches Tailwind breakpoints: sm (639px), lg (1023px)
 */
export const DEFAULT_IMAGE_SIZES = '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 25vw';

type GeoImageProps = Omit<ImageProps, 'src'> & {
  value: string;
};

/** Image component that resolves IPFS values to Pinata gateway URLs. Wraps Next.js Image. */
export function GeoImage({ value, alt = '', unoptimized = false, ...props }: GeoImageProps) {
  const src = getImagePath(value);
  const imageProps = props.fill && !props.sizes ? { ...props, sizes: DEFAULT_IMAGE_SIZES } : props;
  return <Image {...imageProps} src={src} alt={alt} unoptimized={unoptimized} />;
}

type NativeGeoImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  value: string;
};

/** Native img element that resolves IPFS values to Pinata gateway URLs. */
export function NativeGeoImage({ value, alt = '', ...props }: NativeGeoImageProps) {
  const src = getImagePath(value);
  return <img {...props} src={src} alt={alt} />;
}
