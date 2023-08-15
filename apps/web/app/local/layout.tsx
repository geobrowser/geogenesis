'use client';

import { Provider } from 'react-redux';

import * as React from 'react';

import { store } from '~/core/state/wip-local-store/wip-local-store';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
