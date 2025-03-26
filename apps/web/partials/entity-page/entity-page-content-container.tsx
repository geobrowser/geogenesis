'use client';

import * as React from 'react';

type Props = {
  children: React.ReactNode;
};

export function EntityPageContentContainer({ children }: Props) {
  return <div className="mx-auto w-full max-w-[880px]">{children}</div>;
}
