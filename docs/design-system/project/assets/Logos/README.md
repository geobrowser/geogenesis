# Logos

- `geo-mark.svg`: the Geo mark (a ring over a plinth), from `design-system/icons/geo-mark.tsx`. It is a single-ink mark in `currentColor`: it renders black as a tile. Use it in `text` (#202020) on light grounds and white on `text`. The source says it is shared by the app and the OG image renderer.
- `geo-logo-large.svg`: the larger mark with a heavier ring, from `design-system/icons/geo-logo-large.tsx`, fixed ink `#151515` (the same near-black as the navbar Log in pill).

The repo has no separate wordmark file. On phones the navbar sets "Geo" in Geist Medium at 26px, `leading-none` (`brandWordmark` in the type scale). Never redraw the mark.
