import * as React from 'react';
import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          <meta name="robots" content="follow, index" />

          <link rel="apple-touch-icon" sizes="76x76" href="/static/apple-touch-icon.png" />
          <link rel="shortcut icon" type="image/png" href="/static/favicon.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16x16.png" />
          <link rel="manifest" href="/static/site.webmanifest" />
          <link rel="mask-icon" href="/static/favicon-16x16.png" color="#FBFBFB" />
          <meta name="msapplication-TileColor" content="#FBFBFB" />
          <meta name="theme-color" content="#FBFBFB" />
          <meta name="theme-color" media="(prefers-color-scheme: light)" content="#FBFBFB" />
          <meta charSet="utf-8" />
          <meta property="og:type" content="website" />

          {/* Essential for socials */}
          <meta property="og:title" content="Geo Genesis" />
          <meta
            name="description"
            content="Browse and organize the world's public knowledge and information in a decentralized way."
          />
          <meta
            property="og:description"
            content="Browse and organize the world's public knowledge and information in a decentralized way."
          />
          <meta
            property="twitter:description"
            content="Browse and organize the world's public knowledge and information in a decentralized way."
          />
          <meta property="og:image" content="https://www.geobrowser.io/static/geo-social-image.png" />

          {/* Less essential */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta property="og:site_name" content="geobrowser.io" />
          <meta name="twitter:site" content="@geobrowser" />
          <meta name="twitter:creator" content="@geobrowser" />
          <meta name="twitter:image" content="https://www.geobrowser.io/static/geo-social-image.png" />

          {/* Less essential */}
          <meta property="og:site_name" content="geobrowser.io" />
          <meta name="twitter:site" content="@geobrowser" />
          <meta name="twitter:creator" content="@geobrowser" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
