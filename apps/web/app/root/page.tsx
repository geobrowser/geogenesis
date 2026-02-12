import { connection } from 'next/server';

import { ROOT_SPACE } from '~/core/constants';

import Page from '../space/[id]/page';

export default async function RootPage() {
  await connection();
  const params = new Promise<{ id: string }>(resolve => resolve({ id: ROOT_SPACE }));
  return <Page params={params} />;
}
