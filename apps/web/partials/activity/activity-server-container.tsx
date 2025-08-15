import { Effect } from 'effect';

import { EntitiesOrderBy } from '~/core/gql/graphql';
import { getAllEntities } from '~/core/io/v2/queries';

import { Activity } from '~/partials/activity/activity';

type ActivityServerContainerProps = {
  spaceId: string;
};

const limit = process.env.NODE_ENV === 'development' ? 10 : 100;

export const ActivityServerContainer = async ({ spaceId }: ActivityServerContainerProps) => {
  const entities = await Effect.runPromise(
    getAllEntities({
      filter: { spaceIds: { in: [spaceId] } },
      limit,
      orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    })
  );

  // @TODO remove sorting when API returns sorted array
  const namedEntities = entities
    .filter(entity => entity.name && entity.name.trim() !== '')
    .sort((a, b) => {
      const aTime = a.updatedAt ? parseInt(a.updatedAt) : 0;
      const bTime = b.updatedAt ? parseInt(b.updatedAt) : 0;
      return bTime - aTime;
    });

  if (namedEntities.length === 0) {
    return <NoActivity />;
  }

  return <Activity entities={namedEntities} spaceId={spaceId} />;
};

const NoActivity = () => {
  return <p className="text-body text-grey-04">There are no recently updated entities.</p>;
};
