# Plan: Restore Readable Content Widths and Opt In to Sidebar Layouts

**Created:** 2026-07-17
**Status:** In Review

## Overview

Restore a readable default width for entity and space content while keeping a separate, explicit width for pages that actually render a right sidebar.

The implementation should start with the dimensions proposed in the design discussion:

- standard content: `900px` maximum width (up from the historical `880px`)
- content with a right sidebar: `1142px` maximum width
- cover image: retain the existing `1192px` maximum width

The 900/1142 values should be treated as preview values. Before the change is pushed, run the app and share a review link so design can confirm how navigation and alignment feel in real pages.

## Problem Statement

The community-calls work widened the shared `EntityPageContentContainer` from `880px` to `CONTENT_MAX_WIDTH`, currently calculated as `1192 - (4 * 12) = 1144px`. That made room for the space-home community-calls rail, but it also widened every surface that uses the shared container.

The result is an overly long reading measure on content-heavy pages such as articles and posts. The same width now also affects profiles, space headers, governance, claims, activity, debates, community pages, imports, pending spaces, and entity content rendered inside the side panel.

This is a layout-boundary issue: the shared container is expressing the widest specialized layout instead of the normal content layout.

## Current State

### Shared widths

- `apps/web/partials/entity-page/editable-entity-cover-avatar-header.tsx`
  - defines `COVER_MAX_WIDTH = 1192`
  - derives `CONTENT_MAX_WIDTH = 1144`
  - uses that derived content width to align the avatar
- `apps/web/partials/entity-page/entity-page-content-container.tsx`
  - imports the derived width from the cover component
  - applies it to every use of `EntityPageContentContainer`

Before the community-calls change, the cover was already `1192px` wide while normal entity content and avatar alignment were `880px` wide. The regression came from coupling the cover width to the content width, not from widening the cover itself.

### Specialized sidebar

The relevant in-page right sidebar is `SpaceCommunityCallsSection` in `apps/web/partials/community-calls/space-community-calls-section.tsx`:

- it renders only when a space has community-call series
- it occupies a `300px` rail with a left border/padding and a `32px` left margin
- it is hidden at and below the `lg` max-width breakpoint (`1023px`)
- it is currently placed beside the space-home body in `apps/web/app/space/[id]/(space)/page.tsx`

Other side panels (Browse, Explore, entity details, live calls, power tools, and proposal UI) own their layouts independently and should not force the shared entity content width to stay wide.

## Key Design Decision

Make the standard content width the default and require specialized pages to opt in to the sidebar width.

Recommended API:

```tsx
<EntityPageContentContainer />
<EntityPageContentContainer variant="with-sidebar" />
```

The default must remain the narrow/readable variant so future content pages cannot accidentally inherit the sidebar measure. The wide variant should collapse back to the standard `900px` maximum when the sidebar is hidden at `lg`; otherwise the content would become wider precisely when the rail disappears between 900px and 1023px.

The cover should remain independently sized at `1192px`. Avatar alignment should follow the standard content column, not the cover or sidebar width. When a space has the community-calls sidebar, its shared header and tabs should use the same `with-sidebar` width as the overview body so those surfaces align.

## Proposed Solution

### Phase 1: Separate layout tokens

Move the entity-page width values into a small layout constants module rather than deriving content width from cover geometry.

Define explicit values for:

- cover max width: `1192px`
- standard content max width: `900px`
- content-with-sidebar max width: `1142px`

Update `editable-entity-cover-avatar-header.tsx` to use the cover token for the cover wrapper and the standard content token for avatar alignment.

This makes the intended relationship clear: the cover can be visually wider than the reading column, and a sidebar page can opt into a third width without changing either one.

### Phase 2: Add an explicit container variant

Update `EntityPageContentContainer` to accept a narrow union such as `variant?: 'content' | 'with-sidebar'`:

- `content` is the default and caps at `900px`
- `with-sidebar` caps at `1142px` above `1023px`
- `with-sidebar` caps at `900px` at and below `1023px`, matching the point where the rail is hidden

Keep the API limited to semantic variants rather than accepting arbitrary numeric widths. This prevents one-off dimensions from spreading through route components.

All existing call sites should inherit the `content` default without being edited unless they truly render an in-page sidebar.

### Phase 3: Opt the space-home sidebar into the wide layout

Update `apps/web/app/space/[id]/(space)/page.tsx` so only the space-home body that renders `SpaceCommunityCallsSection` selects `with-sidebar`.

The width decision must match sidebar visibility:

- community-call series exist: use `with-sidebar` and render the rail
- no community-call series: use the default `content` width and render no reserved rail
- `lg` and smaller: hide the rail and restore the `900px` cap

Because the presence of community-call series determines the first rendered width, resolve that data before selecting the container variant. Start the community-calls request in parallel with the existing space-page data request where practical so the width is correct on first paint without unnecessarily serializing server work.

Avoid using a client-only measurement or `:has()` rule to discover the rail after it streams in; either would make the page change width after initial paint and recreate the layout shift this work is trying to control.

The parent space layout should use the same server-side community-calls result to select the header container variant. Memoize `fetchCommunityCalls(spaceId)` per server render so the layout and page can make one consistent decision without issuing duplicate graph requests.

### Phase 4: Preserve specialized layout ownership

Do not migrate independent full-page layouts into the entity-page variant as part of this fix.

In particular:

- Explore should keep its existing `1320px` shell and internal `880px` feed column.
- The global Browse sidebar should remain part of `App`/`BrowseSidebar` layout.
- The entity side panel should continue constraining itself through its own fixed/viewport width.
- Community-call live rooms, power tools, proposal bounty rails, and ranking compose screens should keep their own shells.

The scope is the accidental widening of shared entity content plus the one space-home rail that caused it.

### Phase 5: Add focused regression coverage

Add a focused component test for `EntityPageContentContainer` that verifies:

- omitting the variant produces the standard content width
- `with-sidebar` produces the wide desktop width
- the wide variant includes the responsive fallback to the standard width

Add coverage around the space-home layout decision at the smallest practical boundary:

- no community-call series selects normal content and produces no rail
- at least one series selects the sidebar layout and renders the rail

If testing the async route directly requires excessive mocking, extract a small render-only space-home body component and test that boundary rather than mocking all graph and access dependencies.

## Acceptance Criteria

- [ ] Normal entity, article/post, profile, and space header content without a sidebar is capped at `900px`.
- [ ] The cover remains capped at `1192px` and does not animate horizontally when cover/avatar state changes.
- [ ] Avatars align with the left edge of the standard `900px` content column.
- [ ] A space home with community calls can expand to the proposed `1142px` sidebar layout.
- [ ] On spaces with community calls, the space heading, metadata, and tabs expand to the same `1142px` width as the sidebar body.
- [ ] A space home without community calls remains at the standard content width and does not reserve an empty rail.
- [ ] At `1023px` and below, the community-calls rail is hidden and the content returns to the standard `900px` cap.
- [ ] Navigating between content pages and sidebar pages does not produce an extra post-render width change.
- [ ] Other routes using `EntityPageContentContainer` do not need route-specific width overrides.
- [ ] Design reviews the preview and confirms or adjusts the proposed 900/1142 dimensions before push.

## Verification Plan

### Automated

- Run the focused Vitest files with `bun run test <path>` from `apps/web`.
- Run `bun run lint` from the repository root.
- Run `bun run build` from the repository root to cover TypeScript and production compilation.

### Manual visual review

Run the app from the worktree and compare these cases at desktop and responsive widths:

1. A long article/post like the Health example from the discussion.
2. A normal entity with a cover and avatar.
3. A profile/person page with tabs and editor content.
4. A space home with a community-calls rail.
5. A space home with no community-call series.
6. Governance, claims, activity, debates, community, and import pages.
7. An entity opened in the entity side panel.
8. Edit mode as well as browse mode for cover/avatar alignment.

Check at least these viewport boundaries:

- wide desktop with the Browse sidebar open
- wide desktop with the Browse sidebar closed
- just above `1023px`, where the in-page rail is present
- `1023px` and just below it, where the rail disappears
- mobile widths for horizontal overflow

Before pushing, share the running preview URL with design and explicitly call out:

- the 900px normal reading column
- the 1142px space-home sidebar shell
- the accepted horizontal movement when navigating between those two semantic layouts

## Scope Boundaries

### In scope

- Separating cover, content, and sidebar-layout width tokens
- Restoring a readable default entity/content width
- Adding one semantic sidebar variant
- Applying that variant conditionally to the space-home community-calls rail
- Responsive fallback and regression coverage

### Out of scope

- Reserving an empty sidebar on every page
- A global sidebar registry/provider modeled after tabs
- Animating width or horizontal position between route changes
- Redesigning Browse, Explore, the entity side panel, or community-call UI
- Broader typography changes to article/editor content

## Risks and Open Questions

- The current derived content width is `1144px`, while the discussion proposes `1142px`. Implement `1142px` for the preview, but confirm the final two-pixel difference with design rather than silently preserving the derived value.
- Waiting for community-call data before choosing the shell trades some streaming for a stable first layout. Start the fetch in parallel and measure whether it creates a meaningful delay; do not accept a visible width swap to preserve streaming.
- The 1142px shell plus the existing `300px` rail leaves a narrower main column than the normal 900px content layout. This is the expected source of the acknowledged horizontal/content movement and should be evaluated in the preview.
- Width classes and breakpoints are layout behavior, so component assertions alone are insufficient; the breakpoint transition needs browser-level visual verification.

## Related Files

- `apps/web/partials/entity-page/entity-page-content-container.tsx`
- `apps/web/partials/entity-page/editable-entity-cover-avatar-header.tsx`
- `apps/web/partials/entity-page/entity-page-cover.tsx`
- `apps/web/partials/community-calls/space-community-calls-section.tsx`
- `apps/web/app/space/[id]/(space)/page.tsx`
- `apps/web/app/space/[id]/(space)/layout.tsx`
- `apps/web/styles/styles.css`

## Suggested First Implementation Slice

1. Introduce explicit 1192/900/1142 layout tokens.
2. Make `EntityPageContentContainer` default to 900 and add the responsive `with-sidebar` variant.
3. Restore avatar alignment to the standard content token.
4. Select the wide variant only when the space-home rail has content.
5. Add focused tests, run build/lint, and share the preview before pushing.
