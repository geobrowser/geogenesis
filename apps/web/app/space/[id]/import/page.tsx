import { Suspense } from 'react';

import { Subgraph } from '~/core/io';

import { Dots } from '~/design-system/dots';

import { Import } from '~/partials/import/import';

type ImportPageProps = {
  params: { id: string };
};

export default async function ImportPage({ params }: ImportPageProps) {
  const spaceId = params.id;
  const space = await Subgraph.fetchSpace({ id: spaceId });

  if (!space) return null;

  return (
    <Suspense fallback={<Loading />}>
      <Import spaceId={spaceId} space={space} />
    </Suspense>
  );
}

const Loading = () => (
  <div className="fixed inset-0 z-10 flex items-center justify-center">
    <Dots />
  </div>
);
