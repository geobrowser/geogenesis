# Space Dropdown Hover State Padding Fix

**Task**: ts-009a4c  
**Date**: 2026-02-09  
**Status**: Complete, PR #1425  
**Linear**: GEO-1780

## Problem

The space page overflow menu (three dots button) was using old UI styling without visible padding on hover state. Screenshots from Linear showed the current style had no padding/border-radius on hover, but other similar buttons in the app had the new design system hover style with visible padding.

## Solution

Wrapped the Menu trigger (Context/Close icons) in a button element with hover styles:

```tsx
<Menu
  asChild
  trigger={
    <button type="button" className="rounded p-1 transition-colors duration-75 hover:bg-grey-01">
      {isContextMenuOpen ? <Close color="grey-04" /> : <Context color="grey-04" />}
    </button>
  }
  ...
/>
```

## Key Changes

1. **Added button wrapper** with `rounded p-1 hover:bg-grey-01` classes to match design system pattern
2. **Added `asChild` prop** to Menu component to prevent nested buttons (Radix UI composition)
3. **Adjusted transition timing** from `duration-150 ease-in-out` to `duration-75` to match MenuItem component

## Files Modified

- `apps/web/partials/entity-page/editable-space-header.tsx` - The space page header component

## What Worked

The pattern `rounded p-1 hover:bg-grey-01` was already used in the codebase:

- `apps/web/partials/search/dialog.tsx:338`
- `apps/web/partials/versions/create-new-version-in-space.tsx:87`

Following this existing pattern made the solution straightforward.

## Review Findings & Fixes

Initial implementation had two issues caught in code review:

1. **P1 (Critical)**: Missing `asChild` prop caused nested button elements
   - Radix UI's Trigger wraps content in a button by default
   - Without `asChild`, we got `<button><button>...</button></button>`
   - This violates HTML spec and accessibility standards
   - Fixed by adding `asChild` prop to Menu component

2. **P2 (Important)**: Inconsistent transition timing
   - Initial implementation used `duration-150 ease-in-out`
   - MenuItem component uses `duration-75` for hover
   - Changed to `duration-75` for consistency

## Notes for Future Work

- The adjacent HistoryPanel component (same file, line 150) uses similar icons without hover state
- Consider applying this pattern consistently across all icon-based menu triggers
- The design system's IconButton component lacks hover state support - could be enhanced to support this pattern natively instead of using inline buttons

## Verification

- ✅ Lint passed (no new warnings)
- ✅ Code review passed (all P1/P2 findings addressed)
- Visual inspection needed: check hover state matches expected design in screenshots
