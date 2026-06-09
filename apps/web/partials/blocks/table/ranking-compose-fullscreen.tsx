'use client';

import type { CSSProperties } from 'react';

type Props = {
  children: React.ReactNode;
  style?: CSSProperties;
};

/** Fullscreen shell for ranking compose — fixed overlay like power tools. */
export function RankingComposeFullscreen({ children, style }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-white"
      style={{
        top: '60px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
