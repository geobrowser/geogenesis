# HubPillButton

The debates pill: `rounded-full` with a 1px border, `whitespace-nowrap`, 28px high in `metadata` type. This is the main button of every debates surface.

**When to use.** Any action in the debates hub, person rows, request cards, scheduling. `primary` (text fill, white label, `hover:bg-text/90`) is the one thing the row is for, such as Debate now or Accept. `secondary` (grey-02 border, `hover:bg-grey-01`) covers the rest: Schedule, Dismiss. `tag` is the secondary look without the hover, for a pill that holds a value.

**Sizes** (`size`): `default` `h-7 px-3 text-metadata`; `compact` `h-6.5 px-2.5 text-breadcrumb md:h-8 md:px-3` (Requests timeline); `large` `h-12 px-5 text-button`, full width, a dialog's lead choices ("I’m running late", "I can’t make it").

**The consumer provides** the label as children, plus `pending` and `pendingLabel` ("Requesting…", "Accepting…", "Dismissing…") while a mutation runs. The pill is disabled and `aria-busy` while pending; disabled is `opacity-50`.

**Props** — `{ variant?: 'primary'|'secondary'; size?: 'default'|'large'|'compact'; pending?: boolean; pendingLabel?: string; analyticsLabel?; analyticsSurface?; analyticsIntent? } & ComponentProps<'button'>`.

**Same file.** `hubPillClassName(variant, className, size)` for links ("Join debate"). `HUB_ICON_BUTTON_CLASS_NAME` is the 28px round grey-04 icon control (Close, See times, calendar). `HubQuietButton` is the underlined text escape. `FacetPill` (`facet-pill.tsx`) is this pill with a count: `primary` when picked (count `text-white/70`), `secondary` otherwise (count `text-grey-04`).

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/core/debates/matchmaking/hub-pill-button.tsx` (geogenesis master).
