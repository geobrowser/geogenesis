'use client';

import { ResizableContainer } from '~/design-system/resizable-container';

export function MetadataMotionContainer({ children }: { children: React.ReactNode }) {
  return (
    <ResizableContainer duration={0.15}>
      <div className="my-3 bg-bg shadow-big">{children}</div>
    </ResizableContainer>
  );
}
