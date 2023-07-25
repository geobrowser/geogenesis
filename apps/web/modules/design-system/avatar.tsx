import BoringAvatar from 'boring-avatars';
import Image from 'next/legacy/image';

interface Props {
  avatarUrl?: string | null;
  value?: string;
  alt?: string;
  size?: number;
}

export const Avatar = ({ value, avatarUrl, alt = '', size = 12 }: Props) => {
  return avatarUrl ? (
    <Image objectFit="cover" layout="fill" src={avatarUrl} alt={alt} />
  ) : (
    <BoringAvatar size={size} variant="pixel" name={value} />
  );
};
