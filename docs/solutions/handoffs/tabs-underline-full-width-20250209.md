# Tabs Underline Full Width Fix

**Task**: ts-c42da5  
**Date**: 2025-02-09  
**PR**: https://github.com/geobrowser/geogenesis/pull/1421  
**Linear**: GEO-1777

## Problem

The underline beneath tabs only extended as wide as the tab elements themselves, not the full width of the content area. The design reference showed the underline should extend to the edges of the content area.

## Root Cause

The underline div was positioned inside the flex container with `w-max` (width: max-content) at line 120:

```tsx
<div className="relative flex w-max items-center gap-6 pb-2">
  {tabs}
  <div className="absolute bottom-0 left-0 right-0 z-0 h-px bg-grey-02" /> //
  Constrained by parent
</div>
```

Since the parent has `w-max`, it only extends as wide as its content (the tabs). The absolutely positioned underline with `left-0 right-0` extends to fill its positioned ancestor, which is this `w-max` container.

## Solution

Moved the underline div outside the `w-max` flex container but kept it inside the scrollable parent container:

```tsx
<div ref={scrollRef} className="relative ...scrollable...">
  <div className="relative flex w-max items-center gap-6 pb-2">{tabs}</div>
  <div className="absolute bottom-0 left-0 right-0 z-0 h-px bg-grey-02" /> //
  Now spans full scrollable width
</div>
```

Now the underline positions relative to the scrollable container (which has full content width) rather than the `w-max` container.

## Files Modified

- `apps/web/design-system/tab-group.tsx` - Moved underline div from line 120 (inside flex container) to line 121 (outside flex container, inside scrollable parent)

## Verification

- Lint passed (no new errors, only pre-existing warnings)
- Code structure is logically correct - absolute positioning now references the correct parent container
- Visual verification requires running the app (build failed in worktree due to workspace package resolution issues, which is a pre-existing environmental limitation)

## Notes

- Build in worktree failed due to `@geogenesis/auth` workspace package not resolving - this is a known worktree + monorepo limitation, unrelated to the tabs fix
- The fix is a single-line structural change with clear CSS positioning semantics
- No investigation attempts needed - the issue and solution were immediately apparent from code inspection
