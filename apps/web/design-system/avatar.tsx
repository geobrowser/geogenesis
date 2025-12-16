import BoringAvatar from 'boring-avatars';

import { GeoImage } from './geo-image';
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
  return avatarUrl ? (
    <GeoImage fill style={{ objectFit: 'cover' }} priority={priority} value={avatarUrl} alt={alt} />
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
