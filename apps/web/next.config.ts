import { withSentryConfig } from '@sentry/nextjs';

import type { NextConfig } from 'next';

import { ServerEnvironment } from './app/api/environment';

const isDev = process.env.NODE_ENV === 'development';

const marketingOrigin = 'https://geo-website-livid.vercel.app';
// Only marketing-owned paths are forwarded. Genesis retains /_next, app APIs,
// /root, /explore and /space, and legacy campaigns keep their existing hosts.
const marketingPaths = [
  '/',
  '/terms',
  '/api/subscribe',
  '/_marketing/:path*',
  '/opengraph-image.jpg',
  '/twitter-image.jpg',
  '/favicon.ico',
  '/icon.png',
  '/apple-icon.png',
  '/browse/:path*',
  '/collage/:path*',
  '/community/:path*',
  '/curators/:path*',
  '/deck/:path*',
  '/hero/:path*',
  '/match/:path*',
  '/panel/:path*',
  '/platform2/:path*',
  '/platform3/:path*',
  '/rays/:path*',
  '/social/:path*',
  '/trust/:path*',
  '/voice/:path*',
];

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

/**
 * The Sentry release name, resolved once here and used for three things that must agree: the
 * source-map upload, the server SDK, and the browser SDK.
 *
 * Read here rather than at each use site because this file runs on the build server, where
 * `VERCEL_GIT_COMMIT_SHA` exists. The browser bundle only receives `NEXT_PUBLIC_*` variables, so
 * `instrumentation-client.ts` reading `VERCEL_GIT_COMMIT_SHA` directly got `undefined` — every
 * client event was reported with no release, which meant the uploaded source maps had nothing to
 * match against and every client-side stack stayed minified. Measured before this fix: 5,809 of
 * the last 7 days' error events had `release: null` (all the browser ones), while server events
 * carried a sha and resolved fine. That is why the largest client crash groups had sat
 * unactionable for months.
 *
 * Falling back to the local git sha keeps preview and self-hosted builds attributable too.
 */
const sentryRelease = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SENTRY_RELEASE;

/**
 * Response headers. Production currently sends none of these — only Vercel's own HSTS
 * (`strict-transport-security: max-age=63072000`), confirmed against www.geobrowser.io.
 *
 * `Permissions-Policy` is the one worth reading carefully, because getting it wrong breaks
 * debates. The app genuinely needs camera and microphone (LiveKit, `getUserMedia` in six places)
 * and display-capture (community-call screen share, `Track.Source.ScreenShare`), so those are
 * allowed for self rather than omitted — the default is already self, but naming them documents
 * that they are deliberate. Only features nothing in the app uses are denied, and the list stays
 * short on purpose: an exhaustive deny list would eventually refuse something a dependency needs
 * — Privy's embedded wallet and WebAuthn being the obvious hazard — with a failure that looks
 * like a bug in their SDK rather than a line in this file.
 *
 * `frame-ancestors 'none'` is sent twice by design: as `X-Frame-Options` for older agents and as
 * CSP for current ones, which ignore XFO when a CSP frame-ancestors is present. This is a CSP
 * carrying *only* that directive, so it restricts nothing else — a real script/style policy for
 * this app means accounting for Next's inline bootstrap, Sentry, PostHog, Privy, LiveKit, Mapbox
 * and IPFS image hosts, and belongs in its own change with Report-Only first.
 *
 * Clickjacking matters more here than on an ordinary site: a framed page whose user signs wallet
 * transactions is the case the header exists for. Nothing in the app renders an iframe of itself
 * and no embed surface was found. The one thing to know is that this also covers the marketing
 * paths rewritten to `marketingOrigin` below, so if that site is ever embedded somewhere, carve
 * those sources out rather than dropping the header.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  {
    key: 'Permissions-Policy',
    value: [
      'camera=(self)',
      'microphone=(self)',
      'display-capture=(self)',
      'fullscreen=(self)',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'serial=()',
      'bluetooth=()',
      'midi=()',
    ].join(', '),
  },
];

const nextConfig: NextConfig = {
  // Exposed so the browser SDK reports the same release the source maps are uploaded under.
  // Next inlines this at build time; a bare `VERCEL_GIT_COMMIT_SHA` would not reach the client.
  env: {
    ...(sentryRelease ? { NEXT_PUBLIC_SENTRY_RELEASE: sentryRelease } : {}),
  },
  // Drops `x-powered-by: Next.js`, which production sends today. Free, and there is no reason to
  // name the framework and its presence in a response.
  poweredByHeader: false,
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
    turbopackRustReactCompiler: process.env.DISABLE_REACT_COMPILER !== '1',
    ...turbopackOptimizations,
    optimizePackageImports,
  },
  images: {
    // Only hosts we control reach the optimizer. `hostname: '**'` made `/_next/image` an open
    // proxy: anyone could have our deployment fetch, decode, resize and re-serve any HTTPS URL
    // from our domain, under our certificate, on our bill (GEO-2984).
    //
    // Narrowing this is safe because it is not the list of hosts whose images we *display*.
    // Image values are free-text entity properties and an author can type any URL; those still
    // render, via `isOptimizableImageSrc`, which marks foreign hosts `unoptimized` so the browser
    // fetches them from their own origin. `unoptimized` short-circuits `generateImgAttrs` before
    // the default loader runs, so such a src is never checked against these patterns.
    //
    // Keep in step with `OPTIMIZABLE_HOSTS` in `core/utils/utils.ts`, which is derived from
    // `IPFS_GATEWAYS`. A host here but not there is merely unused; a host there but not here is a
    // broken image, which is why the test asserts the two agree.
    remotePatterns: [
      { protocol: 'https', hostname: 'mature-tomato-basilisk.myfilebase.com' },
      { protocol: 'https', hostname: 'magenta-naval-crow-536.mypinata.cloud' },
      { protocol: 'https', hostname: 'gateway.lighthouse.storage' },
      { protocol: 'https', hostname: 'geobrowser.io' },
      { protocol: 'https', hostname: 'www.geobrowser.io' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
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
        ...marketingPaths.map(source => ({
          source,
          destination: `${marketingOrigin}${source}`,
        })),
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

      // Pinned to the same value both SDKs report, so uploaded source maps are guaranteed to be
      // matched against the release the events actually carry rather than a separately-detected
      // one. Omitted (letting the plugin detect it) when there is no sha to pin.
      ...(sentryRelease ? { release: { name: sentryRelease } } : {}),

      // Route Sentry requests through the app to avoid ad-blockers
      tunnelRoute: '/monitoring',

      // Only log source map upload output in CI
      silent: !process.env.CI,
    });
