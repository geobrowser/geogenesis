import * as React from 'react';

/**
 * Sticky right-hand rail shared by Explore and space overview panels.
 */
export function StickySideRail({ children }: { children: React.ReactNode }) {
  return (
    <aside className="sticky top-11 ml-8 flex h-[calc(100dvh-2.75rem)] w-[var(--width-side-rail)] shrink-0 flex-col self-start lg:hidden">
      <div className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="flex flex-col pt-5 pb-6">{children}</div>
      </div>
    </aside>
  );
}
