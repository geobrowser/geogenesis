'use client';

import BoringAvatar from 'boring-avatars';

import { useState } from 'react';

import { NativeGeoImage } from './geo-image';
import { colors } from './theme/colors';

interface Props {
  avatarUrl?: string | null;
  value?: string;
  alt?: string;
  size?: number;
  priority?: boolean;
  square?: boolean;
}

export const Avatar = ({ value, avatarUrl, priority = false, alt = '', size = 12, square = false }: Props) => {
  // Keyed by the url that failed rather than a bare boolean, so a new avatar gets its own attempt
  // without an effect to reset the flag.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const unreachable = avatarUrl != null && failedUrl === avatarUrl;

  return avatarUrl && !unreachable ? (
    <NativeGeoImage
      value={avatarUrl}
      alt={alt}
      className="h-full w-full object-cover"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      // An avatar always has something to fall back to, so a stored image that no longer resolves
      // should show the generated one rather than the browser's broken-image glyph.
      onExhausted={() => setFailedUrl(avatarUrl)}
    />
  ) : (
    <BoringAvatar
      size={size}
      variant="beam"
      name={value}
      colors={[
        colors.light.ctaPrimary,
        colors.light.purple,
        colors.light.pink,
        colors.light.orange,
        colors.light.green,
      ]}
      square={square}
    />
  );
};
