import { useQuery } from '@tanstack/react-query';

import { fetchVersion } from '../io/subgraph/fetch-version';
import { Change } from '../utils/change';

interface ProposalChangesArgs {
  spaceId?: string;
  beforeVersionId: string;
  afterVersionId: string;
}

export const useProposalChanges = (args: ProposalChangesArgs) => {
  const { data, isLoading } = useQuery({
    queryKey: ['proposal-changes', args],
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

      return {
        changes,
        beforeVersion,
        afterVersion,
      };
    },
  });

  return [data, isLoading] as const;
};
