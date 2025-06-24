import { useParams } from 'next/navigation';

import { usePathSegments } from '~/core/hooks/use-path-segments';
import { ROOT_SPACE } from '../constants';

export const useSpaceId = () => {
  const params = useParams();
  const segment = usePathSegments();

  if (segment[0] === 'root') {
    return ROOT_SPACE;
  }

  const spaceId = params?.['id'] as string | undefined;

  return spaceId;
};
