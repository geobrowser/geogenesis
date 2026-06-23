import { useParams } from 'next/navigation';

import { usePathSegments } from '~/core/hooks/use-path-segments';

import { ROOT_SPACE } from '../constants';
import { pendingPersonalSpaceId } from '../state/pending-personal-space';

export const useSpaceId = () => {
  const params = useParams();
  const segment = usePathSegments();

  if (segment[0] === 'root') {
    return ROOT_SPACE;
  }

  // Optimistic personal space route /space/pending/<topicId> has no `id` param;
  // resolve it to the `pending:` sentinel so access-control and the edit toggle work.
  if (segment[0] === 'space' && segment[1] === 'pending' && segment[2]) {
    return pendingPersonalSpaceId(segment[2]);
  }

  const spaceId = params?.['id'] as string | undefined;

  return spaceId;
};
