import * as React from 'react';

import { Metadata } from 'next';

import { DEFAULT_OPENGRAPH_IMAGE, ROOT_SPACE_ID } from '~/core/constants';

import Layout from '../space/[id]/layout';

export const metadata: Metadata = {
  title: 'Geo Genesis',
  description: "Browse and organize the world's public knowledge and information in a decentralized way.",
  twitter: {
    card: 'summary_large_image',
    title: 'Geo Genesis',
    description: "Browse and organize the world's public knowledge and information in a decentralized way.",
    site: '@geobrowser',
    creator: '@geobrowser',
    images: [
      {
        url: DEFAULT_OPENGRAPH_IMAGE,
      },
    ],
  },
  openGraph: {
    title: 'Geo Genesis',
    description: "Browse and organize the world's public knowledge and information in a decentralized way.",
    url: 'https://geobrowser.io/',
    siteName: 'geobrowser.io',
    images: [
      {
        url: DEFAULT_OPENGRAPH_IMAGE,
      },
    ],
  },

  robots: 'follow, index',
};

export const revalidate = 60; // 1 minute

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const params = new Promise<{ id: string }>(resolve => resolve({ id: ROOT_SPACE_ID }));
  return <Layout params={params}>{children}</Layout>;
}
