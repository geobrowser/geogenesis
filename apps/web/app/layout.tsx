import * as React from 'react';
import { Metadata } from 'next';
import { Providers } from '~/modules/providers';
import { DEFAULT_OPENGRAPH_IMAGE } from '~/modules/constants';
import { App } from './entry';

import 'react-medium-image-zoom/dist/styles.css';
import '../styles/fonts.css';
import '../styles/styles.css';
import '../styles/tiptap.css';

//       <link rel="preload" as="image" href={DEFAULT_OPENGRAPH_IMAGE} />

//       <link rel="apple-touch-icon" sizes="76x76" href="/static/apple-touch-icon.png" />
//       <link rel="shortcut icon" type="image/png" href="/static/favicon.png" />
//       <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32x32.png" />
//       <link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16x16.png" />
//       <link rel="manifest" href="/static/site.webmanifest" />
//       <link rel="mask-icon" href="/static/favicon-16x16.png" color="#FBFBFB" />
//       <meta name="msapplication-TileColor" content="#FBFBFB" />

//       {/* Less essential */}
//       <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

export const metadata: Metadata = {
  metadataBase: new URL('https://geobrowser.io'),
  title: 'Geo Genesis',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#FBFBFB' },
    { media: '(prefers-color-scheme: light)', color: '#FBFBFB' },
  ],
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
