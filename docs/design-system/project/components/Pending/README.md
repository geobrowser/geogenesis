# Pending

Keeps a control's size while it waits. The child goes `invisible` and three 4px bouncing `Dots` (grey-03, or grey-02) sit in its place.

**Props** — `Pending { isPending?; position?: 'start'|'center'|'end'; className?; children }`, `Dots { color?: 'bg-grey-03'|'bg-grey-02' }`. Pills prefer a pending label ("Requesting…") over dots.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/pending.tsx` (geogenesis master).
