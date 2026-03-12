import { IdUtils } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { getSpace } from '~/core/io/queries';

import { ImportReview } from '~/partials/import/import-review';

type ImportReviewPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ImportReviewPage(props: ImportReviewPageProps) {
  const params = await props.params;
  const spaceId = params.id;

  if (!IdUtils.isValid(spaceId)) {
    notFound();
  }

  const space = await Effect.runPromise(getSpace(spaceId));

  if (!space) return null;

  return <ImportReview spaceId={spaceId} space={space} />;
}
