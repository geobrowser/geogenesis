import { SystemIds } from '@graphprotocol/grc-20';
import { useParams } from 'next/navigation';

import { usePathSegments } from '~/core/hooks/use-path-segments';

export const useSpaceId = () => {
  const params = useParams();
  const segment = usePathSegments();

  if (segment[0] === 'root') {
    return SystemIds.ROOT_SPACE_ID;
  }

  const spaceId = params?.['id'] as string | undefined;

  return spaceId;
};
