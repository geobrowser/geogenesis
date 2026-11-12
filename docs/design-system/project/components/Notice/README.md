# Notice

A full-page message (404, errors, empty homes): an optional visual, a centred `largeTitle`, an optional `body` description in grey-04, then an action and a footer, inside `max-w-md`, vertically centred in 75vh.

**Props** — `{ visual?; title; description?; action?; footer?; backgroundLayers? }`. Real titles: "Something went wrong", "Reconnecting", "This page could not be found :-(". The 404 action is a primary `Button` "Go to Explore".

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/notice.tsx` (geogenesis master).
