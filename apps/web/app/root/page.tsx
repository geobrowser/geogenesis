import { connection } from 'next/server';

import { ROOT_SPACE } from '~/core/constants';

import Page from '../space/[id]/(space)/page';

export default async function RootPage(props: { searchParams: Promise<{ tabId?: string | string[] }> }) {
  await connection();
  const params = new Promise<{ id: string }>(resolve => resolve({ id: ROOT_SPACE }));
  // Pass searchParams through so `?tabId=` can hide the overview side rail.
  return <Page params={params} searchParams={props.searchParams} />;
}
