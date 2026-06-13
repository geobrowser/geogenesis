'use client';

import type { CSSProperties } from 'react';

type Props = {
  children: React.ReactNode;
  style?: CSSProperties;
};

export function RankingComposeFullscreen({ children, style }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-white"
      style={{
        top: '44px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
