import * as React from 'react';
import { Metadata } from 'next';
import { Providers } from '~/modules/providers';
import { DEFAULT_OPENGRAPH_IMAGE } from '~/modules/constants';

import 'react-medium-image-zoom/dist/styles.css';
import '../styles/fonts.css';
import '../styles/styles.css';
import '../styles/tiptap.css';
import { App } from './entry';

// <title>Geo Genesis</title>
//       <meta property="og:title" content="Geo Genesis" />
//       <meta
//         name="description"
//         content="Browse and organize the world's public knowledge and information in a decentralized way."
//       />
//       <meta
//         property="og:description"
//         content="Browse and organize the world's public knowledge and information in a decentralized way."
//       />
//       <meta property="og:url" content={`https://geobrowser.io/spaces`} />
//       <meta property="og:image" content={DEFAULT_OPENGRAPH_IMAGE} />
//       <meta name="twitter:image" content={DEFAULT_OPENGRAPH_IMAGE} />
//       <link rel="preload" as="image" href={DEFAULT_OPENGRAPH_IMAGE} />

//       <meta name="robots" content="follow, index" />
//       <link rel="apple-touch-icon" sizes="76x76" href="/static/apple-touch-icon.png" />
//       <link rel="shortcut icon" type="image/png" href="/static/favicon.png" />
//       <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32x32.png" />
//       <link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16x16.png" />
//       <link rel="manifest" href="/static/site.webmanifest" />
//       <link rel="mask-icon" href="/static/favicon-16x16.png" color="#FBFBFB" />
//       <meta name="msapplication-TileColor" content="#FBFBFB" />
//       <meta name="theme-color" content="#FBFBFB" />
//       <meta name="theme-color" media="(prefers-color-scheme: light)" content="#FBFBFB" />
//       <meta charSet="utf-8" />
//       <meta property="og:type" content="website" />
//       <meta property="og:image:width" content="1200" />
//       <meta property="og:image:height" content="675" />

//       {/* Less essential */}
//       <meta name="twitter:card" content="summary_large_image" />
//       <meta property="og:site_name" content="geobrowser.io" />
//       <meta name="twitter:site" content="@geobrowser" />
//       <meta name="twitter:creator" content="@geobrowser" />

//       {/* Less essential */}
//       <meta property="og:site_name" content="geobrowser.io" />
//       <meta name="twitter:site" content="@geobrowser" />
//       <meta name="twitter:creator" content="@geobrowser" />
//       <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

export const metadata: Metadata = {
  title: 'Geo Genesis',
  themeColor: '#FBFBFB',
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
