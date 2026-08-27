import BoringAvatar from 'boring-avatars';

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
  // GEO-2642. The generated avatar is the fallback for an image that cannot load, not only for the
  // absence of one. A present-but-unresolvable `avatarUrl` used to render an `<img>` that 404'd
  // through every gateway and settled on the browser's broken-image icon, because this branch keys
  // on the URL being *set* rather than on it working. In a call the avatar comes from a cid minted
  // by curator-backend, so a participant with a stale or malformed one showed as broken while
  // everyone around them looked fine.
  const generated = (
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

  return avatarUrl ? (
    <NativeGeoImage
      value={avatarUrl}
      alt={alt}
      className="h-full w-full object-cover"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      fallback={generated}
    />
  ) : (
    generated
  );
};
