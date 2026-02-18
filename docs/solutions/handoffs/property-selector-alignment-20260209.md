# Property Selector Alignment Fix - 2026-02-09

## Task ID

ts-240f23

## Linear Issue

GEO-1793: Property selector alignment should be left-aligned

## Problem

The property selector dropdown in the table block context menu was not left-aligned with its trigger element. The dropdown appeared misaligned with its left edge not lining up with the left side of the trigger button.

## Root Cause

The Radix UI `Dropdown.Content` component in `apps/web/partials/blocks/table/table-block-context-menu.tsx` had `align="end"` which right-aligns the dropdown menu to the trigger.

## Solution

Changed the `align` prop from `"end"` to `"start"` in the `Dropdown.Content` component at line 68 of `table-block-context-menu.tsx`.

## Files Modified

- `apps/web/partials/blocks/table/table-block-context-menu.tsx` - Changed align prop from "end" to "start"

## Investigation

No investigation needed. The fix was straightforward:

1. Located the PropertySelector component usage in the codebase
2. Found the Dropdown.Content wrapper in table-block-context-menu.tsx
3. Identified the align prop was set to "end" causing right-alignment
4. Changed to "start" for left-alignment

## Verification

- Lint: Passes (same warnings as master)
- Tests: Pass (27 pre-existing failures on master, no new failures introduced)
- Build: Timeout during local build, but change is trivial (single prop value update)

## Key Decisions

None - this was a straightforward UI alignment fix with a clear solution.

## Remaining Concerns

None. The change is minimal and well-understood.

## PR

https://github.com/geobrowser/geogenesis/pull/1423
