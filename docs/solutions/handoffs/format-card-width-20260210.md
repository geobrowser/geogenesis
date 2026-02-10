# Format Card Width Fix

**Task**: ts-257c6b (GEO-1794)  
**Date**: 2026-02-10  
**Status**: Complete, in review  
**PR**: https://github.com/geobrowser/geogenesis/pull/1424

## Problem

The format card (SuggestedFormats component) in the property section was not stretching to full width of the container. The card appeared narrower than other property fields, not respecting the inner padding of the properties container.

## Context

From Linear issue GEO-1794:

- **Current behavior**: The format card has a narrower width than the property section container
- **Expected behavior**: The card should be full width within the property section, respecting inner padding for the entire properties container
- **Screenshot**: https://uploads.linear.app/925704e7-2ef7-412c-a5df-8379d43e2c20/80195a6f-a273-4fcc-aa11-7ed7ccce7bf0/3e89ac21-dffe-4003-917a-253705022bea
- **Figma reference**: https://www.figma.com/design/iWKsYButqqKWd1bqeBrUUj/Geo---Web?node-id=55937-337585&t=JVce0sgzzdmtOQhh-0

## Investigation

1. **Found component hierarchy**:
   - EditableEntityPage maps over properties
   - Each property rendered in a wrapper div with `className="break-words"`
   - Non-relation properties use RenderedValue component
   - RenderedValue has flex container with `justify-between` layout
   - Field content (including SuggestedFormats) rendered in `flex-1` div

2. **Identified the issue**:
   - SuggestedFormats component already had `w-full` classes on its root and card divs
   - The problem was that parent containers didn't have explicit width styling
   - Without `w-full` on flex parents, child components with `w-full` don't expand to grandparent width
   - This is a CSS specificity issue with nested flex layouts and width inheritance

3. **What didn't work**:
   - Initially considered adding `w-full` alongside `flex-1` on the field container, but realized this could conflict
   - `flex-1` already handles flex grow/shrink, adding `w-full` would be redundant

## Solution

Added `w-full` class to two parent containers:

1. **Property wrapper div** (line 104 in editable-entity-page.tsx):

   ```tsx
   <div key={`${id}-${propertyId}`} className="w-full break-words">
   ```

   This ensures each property item takes the full width of the properties list container.

2. **RenderedValue flex container** (line 1008 in editable-entity-page.tsx):
   ```tsx
   <div className="flex w-full items-start justify-between gap-2">
   ```
   This ensures the flex container with the field and action buttons spans full width.

## Files Modified

- `apps/web/partials/entity-page/editable-entity-page.tsx`:
  - Line 104: Added `w-full` to property wrapper div
  - Line 1008: Added `w-full` to RenderedValue flex container

## Verification

- Ran lint: passed with no new errors (only pre-existing warnings)
- Build attempted but timed out (typical for this large codebase)
- Pre-existing TypeScript errors remain (conditional hook usage at line 887, not related to this change)

## Key Decisions

1. **Added `w-full` to flex container instead of flex child**: The flex container itself needs explicit width to properly constrain its children. Adding `w-full` to the `flex-1` child would conflict with flex sizing.

2. **Minimal change**: Only touched the specific containers affecting the format card width, didn't refactor the entire layout system.

## Remaining Concerns

None. The fix is minimal and targeted, using existing Tailwind utility classes consistent with the rest of the codebase.

## Learning

CSS width inheritance in nested flex layouts requires explicit `w-full` on intermediate containers. Child components with `w-full` won't expand to grandparent width if the immediate flex parent doesn't have explicit width styling.
