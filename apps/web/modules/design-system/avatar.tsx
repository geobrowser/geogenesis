import BoringAvatar from 'boring-avatars';
import Image from 'next/legacy/image';

import { getImagePath } from '~/modules/utils';

interface Props {
  avatarUrl?: string | null;
  value?: string;
  alt?: string;
}

export const Avatar = ({ value, avatarUrl, alt = '' }: Props) => {
  return avatarUrl ? (
    <Image objectFit="cover" layout="fill" src={getImagePath(avatarUrl)} alt={alt} />
  ) : (
    <BoringAvatar size={12} square={true} variant="pixel" name={value} />
  );
};
