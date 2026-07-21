import { withSentryConfig } from '@sentry/nextjs';

import type { NextConfig } from 'next';

import { ServerEnvironment } from './app/api/environment';

const isDev = process.env.NODE_ENV === 'development';

// Faster local dev. Opt in with ENABLE_TURBOPACK_OPTIMIZATIONS=1.
// Flags defined on ExperimentalConfig:
// https://github.com/vercel/next.js/blob/canary/packages/next/src/server/config-shared.ts
const turbopackOptimizations =
  isDev && process.env.ENABLE_TURBOPACK_OPTIMIZATIONS === '1'
    ? {
        turbopackTreeShaking: false,
        turbopackRemoveUnusedExports: false,
        turbopackRemoveUnusedImports: false,
        turbopackInferModuleSideEffects: false,
      }
    : {};

const optimizePackageImports = ['effect', 'viem', 'wagmi', 'date-fns'];

const nextConfig: NextConfig = {
  // reactStrictMode: true,
  reactCompiler: process.env.DISABLE_REACT_COMPILER !== '1',
  agentRules: false,
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  turbopack: isDev
    ? {
        resolveAlias: {
          '@sentry/nextjs': './prebundled/sentry-stub.js',
          '@sentry/browser': './prebundled/sentry-stub.js',
          '@sentry/opentelemetry': './prebundled/sentry-stub.js',
        },
      }
    : undefined,
  experimental: {
    turbopackRustReactCompiler: true,
    ...turbopackOptimizations,
    optimizePackageImports,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'testnet.geobrowser.io',
          },
        ],
        destination: 'https://www.geobrowser.io/:path*',
        permanent: false,
      },
      {
        source: '/spaces',
        destination: '/root',
        permanent: false,
      },

      {
        // governing public knowledge
        source: '/space/0x2B5357e08aE291848Ff467eB1a8239d2e392bef5/c714d348-c4a5-44be-bd3c-fe56f241b0eb',
        destination: '/space/6tfhqywXtteatMeGUtd5EB/5WHP8BuoCdSiqtfy87SYWG',
        permanent: true,
      },
      {
        // grc-20
        source: '/space/0x2B5357e08aE291848Ff467eB1a8239d2e392bef5/54337cb3-55e7-4d2a-952b-b328aa3a1d58',
        destination: '/space/6tfhqywXtteatMeGUtd5EB/5FkVvS4mTz6Ge7wHkAUMRk',
        permanent: true,
      },
      {
        // knowledge graphs are web3
        source: '/space/0x2B5357e08aE291848Ff467eB1a8239d2e392bef5/0e42984f-bf78-4f52-8b1e-4f04af6611b5',
        destination: '/space/6tfhqywXtteatMeGUtd5EB/XYo6aR3VqFQSEcf6AeTikW',
        permanent: true,
      },
      {
        source: '/future-thinkers',
        destination: 'https://forms.gle/WkgcmQhnqKACXeQW6',
        permanent: false,
      },
      {
        source: '/we-heart-sf',
        destination: 'https://forms.gle/8BN2VrZZieeYnkMd9',
        permanent: false,
      },
      {
        source: '/join',
        destination: 'https://www.geobrowser.io/',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    // Dev-only same-origin proxy for the geo-chat (debates) API. The prod/testnet chat
    // API only allowlists geobrowser.io origins for CORS, so a local dev server on
    // localhost:4360 can't call it directly. Set GEO_CHAT_PROXY_TARGET to the upstream
    // (e.g. https://chat-api-testnet.geobrowser.io) and point NEXT_PUBLIC_GEO_CHAT_API_BASE_URL
    // at /geo-chat-proxy so browser requests stay same-origin and Next forwards them
    // server-side, sidestepping CORS. Gated to development so a stray GEO_CHAT_PROXY_TARGET
    // in a prod env can't accidentally ship an origin-bypassing proxy route.
    const geoChatProxyTarget = isDev ? process.env.GEO_CHAT_PROXY_TARGET?.replace(/\/+$/, '') : undefined;
    const geoChatProxyRewrites = geoChatProxyTarget
      ? [{ source: '/geo-chat-proxy/:path*', destination: `${geoChatProxyTarget}/:path*` }]
      : [];

    return {
      beforeFiles: [
        ...geoChatProxyRewrites,
        {
          source: '/',
          destination: 'https://geo.framer.website/',
        },
        {
          source: '/early-access',
          destination: 'https://geobrowser-v2.vercel.app/early-access',
        },
        {
          source: '/curator-program',
          destination: 'https://geobrowser-v2.vercel.app/curator-program',
        },
        {
          source: '/curator-registration',
          destination: 'https://geobrowser-v2.vercel.app/curator-registration',
        },
        {
          source: '/ending-homelessness',
          destination: 'https://geo.framer.website/ending-homelessness',
        },
        {
          source: '/blog',
          destination: 'https://geo-blog.vercel.app',
        },
        {
          source: '/:path*',
          has: [
            {
              type: 'host',
              value: 'testnet.geobrowser.io',
            },
          ],
          destination: 'https://geogenesis-git-stream-v2-geo-browser.vercel.app/:path*',
        },
      ],
      afterFiles: [],
      fallback:
        process.env.ENABLE_NOT_FOUND_PREVIEW === '1'
          ? []
          : [
              // Fallback for any assets that don't exist in the Next.js app
              // This will catch marketing site assets without conflicting with /api or /public
              {
                source: '/:path*',
                destination: 'https://geobrowser-v2.vercel.app/:path*',
              },
            ],
    };
  },
};

export default process.env.DISABLE_SENTRY === '1'
  ? nextConfig
  : withSentryConfig(nextConfig, {
      org: ServerEnvironment.sentryBuild?.org,
      project: ServerEnvironment.sentryBuild?.project,
      authToken: ServerEnvironment.sentryBuild?.authToken,

      // Route Sentry requests through the app to avoid ad-blockers
      tunnelRoute: '/monitoring',

      // Only log source map upload output in CI
      silent: !process.env.CI,
    });
