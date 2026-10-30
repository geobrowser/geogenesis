'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import * as React from 'react';

import { Provider as JotaiProvider } from 'jotai';

import { AnalyticsUserIdentifier } from './analytics-user-identifier';
import { GoogleOAuthHost } from './auth/google-oauth';
import { BrowserTimezoneReporter } from './debates/browser-timezone';
import { EmailClickReporter } from './notifications/email-click';
import { NotificationRegistration } from './notifications/hooks';
import { SeenPing } from './notifications/seen-ping';
import { PrivyAuthTracker } from './privy-auth-tracker';
import { ReactQueryProvider } from './query-client';
import { SentryUserIdentifier } from './sentry-user-identifier';
import { DiffProvider } from './state/diff-store';
import { store } from './state/jotai-store';
import { SyncEngineProvider } from './sync/use-sync-engine';
import { AuthRoot } from './wallet/auth-root';

interface Props {
  children: React.ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <>
      <AuthRoot />
      <PrivyAuthTracker />
      <ReactQueryProvider>
        <AnalyticsUserIdentifier />
        <NotificationRegistration />
        <SeenPing />
        <EmailClickReporter />
        <BrowserTimezoneReporter />
        <SentryUserIdentifier />
        <JotaiProvider store={store}>
          {/* Inside the Jotai provider: it reads the googleSignIn flag. */}
          <GoogleOAuthHost />
          <SyncEngineProvider>
            <DiffProvider>{children}</DiffProvider>
            {process.env.NEXT_PUBLIC_DISABLE_RQ_DEVTOOLS !== '1' && <ReactQueryDevtools initialIsOpen={false} />}
          </SyncEngineProvider>
        </JotaiProvider>
      </ReactQueryProvider>
    </>
  );
}
