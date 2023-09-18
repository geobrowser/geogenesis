import BoringAvatar from 'boring-avatars';
import Image from 'next/legacy/image';

import { getImagePath } from '~/core/utils/utils';

import { colors } from './theme/colors';

interface Props {
  avatarUrl?: string | null;
  value?: string;
  alt?: string;
  size?: number;
  priority?: boolean;
}

export const Avatar = ({ value, avatarUrl, priority = false, alt = '', size = 12 }: Props) => {
  return avatarUrl ? (
    <Image objectFit="cover" priority={priority} layout="fill" src={getImagePath(avatarUrl)} alt={alt} />
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
    />
  );
};
