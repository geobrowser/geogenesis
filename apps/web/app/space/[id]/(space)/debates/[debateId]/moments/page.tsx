import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import { notFound } from 'next/navigation';

import { MomentsEditor } from '~/core/debates/moments-editor/moments-editor';

/** GEO-3671. Media admins only; the page asks geo-chat before it shows anything. */
export const metadata: Metadata = {
  title: 'Edit moments',
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ id: string; debateId: string }>;
}

export default async function MomentsEditorPage({ params }: Props) {
  const { id, debateId } = await params;
  if (!IdUtils.isValid(id) || !IdUtils.isValid(debateId)) notFound();

  return <MomentsEditor debateId={debateId} />;
}
