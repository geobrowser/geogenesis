import * as React from 'react';

import { Metadata } from 'next';

import 'katex/dist/katex.min.css';
import localFont from 'next/font/local';
import Script from 'next/script';
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

const xPixelId = process.env.NEXT_PUBLIC_X_PIXEL_ID;

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
    <html lang="en" className={`${calibre.variable}`} suppressHydrationWarning>
      <body>
        {xPixelId && (
          <Script
            id="x-conversion-tracking-base"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
                },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
                a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
                twq('config', ${JSON.stringify(xPixelId)});
              `,
            }}
          />
        )}
        <div className="relative">
          <Providers>
            <App>{children}</App>
          </Providers>
        </div>
      </body>
    </html>
  );
}
