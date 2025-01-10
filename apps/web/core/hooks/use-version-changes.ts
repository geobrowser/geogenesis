import { useQuery } from '@tanstack/react-query';

import { fetchHistoryVersion } from '../io/subgraph/fetch-history-version';
import { Change } from '../utils/change';

interface VersionChangesArgs {
  spaceId?: string;
  beforeVersionId: string;
  afterVersionId: string;
}

export const useVersionChanges = (args: VersionChangesArgs) => {
  const { data, isLoading } = useQuery({
    queryKey: ['version-changes', args],
    queryFn: async () => {
      const [beforeVersion, afterVersion] = await Promise.all([
        fetchHistoryVersion({ versionId: args.beforeVersionId }),
        fetchHistoryVersion({ versionId: args.afterVersionId }),
      ]);

      if (afterVersion === null) {
        return null;
      }

      const changes = Change.fromVersions({
        beforeVersion,
        afterVersion,
        spaceId: args.spaceId,
      });

      return {
        changes,
        beforeVersion,
        afterVersion,
      };
    },
  });

  return [data, isLoading] as const;
};
