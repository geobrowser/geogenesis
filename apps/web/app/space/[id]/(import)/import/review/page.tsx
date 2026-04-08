import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { notFound } from 'next/navigation';

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

  return <ImportReview spaceId={spaceId} />;
}
