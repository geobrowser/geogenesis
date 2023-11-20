'use client';

import { Provider, createStore } from 'jotai';

import * as React from 'react';

export const store = createStore();

export function JotaiProvider({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
