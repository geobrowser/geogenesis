import { useTableBlockInstance } from '~/core/state/table-block-store';

export function useRelationsQueryBlock() {
  const { entityId, spaceId, relationId } = useTableBlockInstance();

  return {
    data: undefined,
  };
}
