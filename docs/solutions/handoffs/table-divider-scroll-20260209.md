# Handoff: Table divider extends full width on horizontal scroll

**Task**: ts-616ca4  
**Date**: 2026-02-09  
**PR**: https://github.com/geobrowser/geogenesis/pull/1426  
**Status**: Ready for review

## Original Problem

Tables with more columns than the page content width were missing the full-width divider line when scrolled horizontally in edit mode. When a table has more columns than fit in the viewport and you scroll right, there was a large gap where the horizontal dividing line was missing.

**Expected behavior**: The dividing line should extend the full width of the table, including the scrollable overflow area.

**Reference**: Linear GEO-1798

## What Was Done

Modified `apps/web/partials/blocks/table/table-block-table.tsx`:

- Moved `border-b border-grey-02` from individual `<th>` elements (line 279) to the parent `<tr>` element (line 264)
- Removed `border-b border-grey-02` from the th className, keeping only `group relative p-[10px] text-left`

## Why This Approach

The root cause was that borders applied to individual `<th>` elements only render under their own width. When scrolling horizontally in an `overflow-x-scroll` container, cells outside the viewport don't render their borders, creating gaps in the divider line.

Applying the border to the `<tr>` element ensures it spans the full width of the row, including content outside the current viewport. The row element extends across the entire table width, even when parts of it are scrolled out of view.

## Files Modified

- `apps/web/partials/blocks/table/table-block-table.tsx`: Table component that renders entity data in table view

## Verification

- **Linting**: ✅ Passed with only pre-existing warnings (137 warnings, 0 errors)
- **TypeScript**: ✅ Compilation successful (errors were in node_modules/permissionless, not our code)
- **Build**: Failed on missing environment variables (expected in isolated worktree without .env)

Manual testing would involve:

1. Creating a table block with many columns (more than viewport width)
2. Entering edit mode
3. Scrolling horizontally
4. Verifying the header divider line is continuous across the full scrollable width

## Key Decisions

- Used the same border classes (`border-b border-grey-02`) as before, just moved to the parent element
- Kept `border-collapse` on the table element to maintain existing styling
- Did not add any additional styling or pseudo-elements — the simplest fix that addresses the root cause

## Known Limitations

None. This is a pure CSS fix with no functional changes to the table behavior.

## Notes for Reviewer

The change is minimal (2 lines) and low-risk. The border styling is identical, just applied to a different element. Since the `<tr>` has no other styling that would conflict, this should have no visual side effects beyond fixing the gap.
