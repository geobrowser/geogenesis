import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import { notFound } from 'next/navigation';

import { MOMENTS_EDITOR_CLOSEABLE_PARAM } from '~/core/debates/debate-routes';
import { MomentsEditor } from '~/core/debates/moments-editor/moments-editor';

/** GEO-3671. Media admins only; the page asks geo-chat before it shows anything. */
export const metadata: Metadata = {
  title: 'Edit moments',
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ id: string; debateId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MomentsEditorPage({ params, searchParams }: Props) {
  const { id, debateId } = await params;
  if (!IdUtils.isValid(id) || !IdUtils.isValid(debateId)) notFound();
  // Opened in its own tab from the Best debates popup (GEO-3742): Done closes the tab.
  const closeable = (await searchParams)[MOMENTS_EDITOR_CLOSEABLE_PARAM] === '1';

  return <MomentsEditor debateId={debateId} closeable={closeable} />;
}
