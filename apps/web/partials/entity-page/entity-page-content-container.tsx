'use client';

import * as React from 'react';

import { CONTENT_MAX_WIDTH } from './editable-entity-cover-avatar-header';

type Props = {
  children: React.ReactNode;
  /** Widen to fit the cover (`CONTENT_MAX_WIDTH`) for content that sits alongside a right rail. Defaults to the old 880px column width. */
  wide?: boolean;
};

export function EntityPageContentContainer({ children, wide = false }: Props) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: wide ? CONTENT_MAX_WIDTH : 880 }}>
      {children}
    </div>
  );
}
