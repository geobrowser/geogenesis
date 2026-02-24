import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://58d8e94d5f37477a9122e45edea792e4@o4510426526908417.ingest.us.sentry.io/4510941605986304',

  environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  // 100% of traces in development, 20% in production
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.2,
});
