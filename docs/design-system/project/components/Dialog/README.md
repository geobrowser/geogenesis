# Dialog

The generic Radix dialog: an overlay of `bg-text/20` and a white `rounded-lg p-4` card up to 586px wide and 415px tall, placed 160px from the top (`mt-40`). The header row ends with a `SquareButton` close.

**When to use.** Pickers and tool dialogs in the editor. Debates prompts use the modal card in `DebateRequestDialog` instead.

**Props** — `{ title?; trigger: ReactNode; header: ReactNode; content: ReactNode }`. It holds its own open state.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/dialog.tsx` (geogenesis master).
