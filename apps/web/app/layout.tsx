import * as React from 'react';
import { Metadata } from 'next';
import { Providers } from '~/modules/providers';
import { DEFAULT_OPENGRAPH_IMAGE } from '~/modules/constants';
import { App } from './entry';

import 'react-medium-image-zoom/dist/styles.css';
import '../styles/fonts.css';
import '../styles/styles.css';
import '../styles/tiptap.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.ENV_URL!),
  title: 'Geo Genesis',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#FBFBFB' },
    { media: '(prefers-color-scheme: light)', color: '#FBFBFB' },
  ],
  description: "Browse and organize the world's public knowledge and information in a decentralized way.",
  manifest: '/static/site.webmanifest',
  icons: {
    icon: '/static/favicon.png',
    shortcut: '/static/favicon.png',
    apple: {
      sizes: '76x76',
      url: '/static/apple-icon.png',
    },
    other: [
      {
        rel: 'apple-touch-icon-precomposed',
        url: '/static/apple-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        url: '/static/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        url: '/static/favicon-16x16.png',
      },
    ],
  },
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
    type: 'website',
    description: "Browse and organize the world's public knowledge and information in a decentralized way.",
    url: 'https://geobrowser.io/',
    siteName: 'geobrowser.io',
    images: [
      {
        url: DEFAULT_OPENGRAPH_IMAGE,
        width: 1200,
        height: 675,
      },
    ],
  },
  appleWebApp: {
    title: 'Geo Genesis',
  },
  robots: 'follow, index',
};

export default function RootLayout({
  // Layouts must accept a children prop.
  // This will be populated with nested layouts or pages
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" as="image" href={DEFAULT_OPENGRAPH_IMAGE} />
      </head>
      <body>
        <div className="relative">
          <Providers>
            <App>{children}</App>
          </Providers>
        </div>
      </body>
    </html>
  );
}
