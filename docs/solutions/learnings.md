# Learnings

### CSS: w-full doesn't propagate through flex containers without explicit width

When a child component has `w-full` (width: 100%) but its parent flex container doesn't have explicit width styling, the child won't expand to the grandparent's width. In React fragments that return multiple siblings within a flex container, each sibling inherits width from the immediate flex parent, not from ancestors. Solution: add `w-full` to intermediate flex containers to ensure proper width inheritance down the component tree. This is especially important when components with `w-full` are rendered inside fragments within flex layouts.

### Radix UI: Use asChild when wrapping triggers with custom buttons

When wrapping a Radix UI Trigger (from Menu, Popover, etc.) in a custom button element, always set `asChild={true}` on the parent component. Without it, Radix's Trigger wraps content in its own button, resulting in nested buttons (`<button><button>...</button></button>`), which violates HTML spec and accessibility standards. The `asChild` prop tells Radix to merge props with your custom element instead of wrapping it. This pattern is used consistently in `create-entity-dropdown.tsx` and `create-space-dropdown.tsx`. The Menu component accepts `asChild` prop specifically for this purpose.

### Table borders: Apply borders to tr, not individual th elements, for full-width dividers

When creating horizontal dividers in tables with horizontal scrolling, apply `border-b` to the `<tr>` element rather than individual `<th>` elements. Borders on `th` elements only extend under their own width, creating gaps when scrolling reveals content outside the viewport. The `<tr>` border spans the full row width including scrollable overflow, ensuring continuous divider lines. This applies to any scrollable table layout with `overflow-x-scroll` on a parent container. Tested in `table-block-table.tsx` with `border-collapse` table styling.
