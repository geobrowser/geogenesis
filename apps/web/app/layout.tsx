import * as React from 'react';

import { Metadata } from 'next';

import cx from 'classnames';
import 'katex/dist/katex.min.css';
import localFont from 'next/font/local';
import 'react-medium-image-zoom/dist/styles.css';

import { Providers } from '~/core/providers';

import '../styles/chat.css';
import '../styles/styles.css';
import '../styles/tiptap.css';
import { App } from './entry';

const calibre = localFont({
  src: [
    {
      path: './fonts/calibre-regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/calibre-medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/calibre-semibold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/calibre-bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-calibre',
});

const geistMedium = localFont({
  src: './fonts/Geist-Medium-v1.ttf',
  weight: '500',
  style: 'normal',
  variable: '--font-geist-medium',
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.ENV_URL ?? 'https://geobrowser.io'),
  title: 'Geo Genesis',
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
    site: '@geobrowser',
    creator: '@geobrowser',
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
    <html lang="en" className={cx(calibre.variable, geistMedium.variable)} suppressHydrationWarning>
      <head>
        <script
          id="google-tag-manager"
          dangerouslySetInnerHTML={{
            __html:
              "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-KJQ3T7W9');",
          }}
        />
      </head>
      <body>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KJQ3T7W9"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
            title="Google Tag Manager"
          />
        </noscript>
        <div className="relative">
          <Providers>
            <App>{children}</App>
          </Providers>
        </div>
      </body>
    </html>
  );
}
