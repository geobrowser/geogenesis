import { connection } from 'next/server';

import * as React from 'react';

import { Metadata } from 'next';

import { ROOT_SPACE } from '~/core/constants';

import Layout from '../space/[id]/layout';

export const metadata: Metadata = {
  title: 'Geo Genesis',
  description: "Browse and organize the world's public knowledge and information in a decentralized way.",
  robots: 'follow, index',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const params = new Promise<{ id: string }>(resolve => resolve({ id: ROOT_SPACE }));
  return <Layout params={params}>{children}</Layout>;
}
