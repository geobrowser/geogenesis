# Tooltip

A Radix tooltip in three variants. `dark` (default) is a text-fill box, white `breadcrumb` type, centred, at most 192px, with an arrow. `light` is a white card with `shadow-lg` and `metadata` type, at most 250px. `propertyDescription` is a 350px bordered card that clamps to 3 lines.

**Props** — `{ trigger; label; position?: 'top'|'bottom'|'left'|'right' ('bottom'); align?; variant?; openOnPress? (touch toggles); delayDuration? (300) }`. Blocked actions explain themselves in a tooltip on press ("Ben is away. You can request a debate when they're back.").

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/tooltip.tsx` (geogenesis master).
