import * as React from 'react';

/**
 * The right-hand rail shared by every space tab that renders a side panel.
 *
 * The width and the `<aside>` element are both load-bearing: `EntityPageSidebarLayout`
 * lays the rail out as a flex sibling of the main column, so without `w-[300px] shrink-0`
 * the rail sizes to its own content and squeezes the content column. The `<aside>` tag is
 * what `EntityPageContentContainer`'s `auto-sidebar` variant matches on (`has-[aside]`) to
 * widen the page to the with-sidebar max width. Panels that render conditionally should
 * return `null` above this shell so the page falls back to the readable content width.
 */
export function EntityPageSideRail({ children }: { children: React.ReactNode }) {
  return (
    <aside className="ml-8 w-[300px] shrink-0 border-l border-divider pl-8 lg:hidden">
      <div className="flex flex-col gap-6 pb-4">{children}</div>
    </aside>
  );
}
