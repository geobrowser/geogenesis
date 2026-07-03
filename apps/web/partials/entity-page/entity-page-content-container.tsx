'use client';

import * as React from 'react';

import { CONTENT_MAX_WIDTH } from './editable-entity-cover-avatar-header';

type Props = {
  children: React.ReactNode;
};

export function EntityPageContentContainer({ children }: Props) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: CONTENT_MAX_WIDTH }}>
      {children}
    </div>
  );
}
