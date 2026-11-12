# Toggle

A 16×10 switch with an 8px white knob. The track is text (#202020) when on and grey-03 when off (inline styles from `colors.ts`), and the knob springs across in 0.2s. An invisible `-inset-2` catcher enlarges the hit area.

**Props** — `{ checked: boolean } & ComponentPropsWithoutRef<'div'>`. The parent owns the click.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/toggle.tsx` (geogenesis master).
