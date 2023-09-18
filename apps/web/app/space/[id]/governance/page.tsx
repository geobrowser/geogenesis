import { ServerSideEnvParams } from '~/core/types';

import { SpaceLayout } from '../space-layout';

interface Props {
  params: { id: string };
  searchParams: ServerSideEnvParams;
}

export default async function GovernancePage({ params, searchParams }: Props) {
  return (
    // @ts-expect-error async JSX function
    <SpaceLayout params={params} searchParams={searchParams}>
      Hello world
    </SpaceLayout>
  );
}
