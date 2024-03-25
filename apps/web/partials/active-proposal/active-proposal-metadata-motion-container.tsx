'use client';

import { LayoutGroup, motion } from 'framer-motion';

import { ResizableContainer } from '~/design-system/resizable-container';

export function MetadataMotionContainer({ children }: { children: React.ReactNode }) {
  return (
    <LayoutGroup id="active-proposal-metadata-header">
      <ResizableContainer>
        <div className="my-3 bg-bg shadow-big">{children}</div>
      </ResizableContainer>
    </LayoutGroup>
  );
}
