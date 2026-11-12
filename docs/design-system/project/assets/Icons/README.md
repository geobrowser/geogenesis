# Icons

These are the app's own icon set, `apps/web/design-system/icons/*.tsx`: 150 glyphs, each rendered from its React component with default props and saved as SVG. Most are drawn at 16×16 (some 12, 8 or 10). They are outline glyphs with 1px strokes; a few are filled.

**Ink.** 128 of them draw in `currentColor`. In the app they take the text colour of their parent: `text` (#202020) for active controls, `grey-04` (#606060) at rest, `grey-03` (#B6B6B6) when muted, white on dark pills. As `<img>` tiles here they render black. Inline them as SVG and set `color` (e.g. `text-grey-04`) to use them. In the components, many of these icons take a `color` prop that resolves to a hex from `colors.ts`, which has the same effect.

**Fixed-ink icons** (22), which keep their colours:
- `editor-h1`, `editor-h2`, `editor-h3`, `editor-list`, `editor-table`, `editor-video`, `editor-image`, `magic`: grey-05 #35363A (white details in magic).
- `camera`, `right-arrow-diagonal-small`, `order-dots`: grey-04 #606060 (camera on a white fill). `filtered-table-view`: #606060 with #DBDBDB.
- `check-circle-checked-small`: #2A2B2E disc with a white tick. `check-circle-unchecked-small`: grey-03 #B6B6B6 ring.
- `gallery-placeholder`: grey-03 / #F7F7F7 / white picture placeholder.
- `triangle-up-circle`: a white triangle only. In the app it sits on a 13px `bg-purple` disc (the wrapper span is not part of the SVG), so it is invisible on white here.
- `blank`, `editor-text`: empty or near-empty frames used as spacers.
- Third-party marks, each in its own brand colours: `google-mark`, `outlook-mark`, `linkedin`, `reddit`. (`discord` draws in currentColor.)

**Composite.** `response-position-icon.tsx` is a switch over `thumb-up` / `thumb-down` / `vote-arrow`. It is not a separate glyph, so it is not included. `thumb-up`/`thumb-down` also take `filled`, which fills the body and drops the handle stroke for the picked side.

`gem` and `triangle-up-circle` wrap their SVG in a sizing `<span>` in the source. Only the SVG is kept here.
