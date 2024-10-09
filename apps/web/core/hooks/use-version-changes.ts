import { useQuery } from '@tanstack/react-query';

import { fetchVersion } from '../io/subgraph/fetch-version';
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
        fetchVersion({ versionId: args.beforeVersionId }),
        fetchVersion({ versionId: args.afterVersionId }),
      ]);

      if (afterVersion === null) {
        return null;
      }

      const changes = Change.fromVersions({
        beforeVersion,
        afterVersion,
        spaceId: args.spaceId,
      });

      console.log('changes', { beforeVersion, afterVersion });

      return {
        changes,
        beforeVersion,
        afterVersion,
      };
    },
  });

  return [data, isLoading] as const;
};
