import { Effect } from 'effect';

import { getEntityBacklinks } from '~/core/io/v2/queries';

import { Backlink, Backlinks } from '~/partials/entity-page/backlinks';

type BacklinksServerContainerProps = {
  entityId: string;
};

export const BacklinksServerContainer = async ({ entityId }: BacklinksServerContainerProps) => {
  const backlinks = await Effect.runPromise(getEntityBacklinks(entityId));

  if (backlinks.length === 0) return null;

  return <Backlinks backlinks={backlinks as Backlink[]} />;
};
