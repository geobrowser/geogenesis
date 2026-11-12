Geo is a quiet, near-monochrome interface. It uses black ink (`text` #202020) on white, grey hairlines, Calibre type, and pills for the actions people take. Colour is rare and means something: green is agree and online, red-01 is disagree and error, ctaPrimary blue is the classic editor action. Build mockups from the tokens and component cards below, using the class strings the components use. Do not draw a generic UI and then recolour it.

## Content fundamentals

- **Plain and short.** Labels are verbs or nouns people already know: "Debate now", "Schedule", "Accept", "Dismiss", "Not now", "Explore claims", "Reject request", "See times", "Show more". Use sentence case and no trailing full stop on controls.
- **Self-explanatory UI, no explainer sub-labels.** Do not add a grey line under a button or heading to explain what it does. If a control needs an explanation, rename it. Helper lines appear only for real state, such as "Away", "Expires in 4m", or "Dev Raman is in a debate. You can accept once they’re free."
- **Agree / Disagree.** A claim's two sides are always "Agree" and "Disagree", never Verify/Dispute, Yes/No or For/Against. Shares read as "62% agree". The debate's two people are "You" and the other person's name, divided by "VS".
- **Second person, warm but brief.** "You’re not available now", "Your debate with Ava starts in 5 minutes", "I’m running late", "I can’t make it", "How late will you be?". Use first person only on choices the user speaks ("I’m running late").
- **Typographic punctuation.** Curly apostrophes (’), a real ellipsis in pending labels ("Requesting…", "Accepting…"), and “quotes”.
- **Toasts are one sentence**, sometimes with an exclamation: "Link copied!", "Vote published!", "Google sign-in didn't complete. Try again."
- **Errors say what happened**, in `footnote` red-01 under the control or as a full-page `Notice` ("Something went wrong", "This page didn’t load properly.").
- **No emoji** in UI copy. The only playful string in the source is the 404 title, "This page could not be found :-(".
- Claims are full sentences in sentence case, ending with a full stop, e.g. "Cities should ban private cars from their centres."

## Visual foundations

### Colour
- **Ground** is `white`. `grey-01` (#f6f6f6) is the quiet fill: menu hover plates, the claim summary band, the RequestParties strip, avatar fallbacks. `bg` (#fbfbfb) is the hover ground of classic outlined buttons. `divider` (#f0f0f0) is the lightest line, and also the selected Agree/Disagree fill and the modal card ground.
- **Ink** is `text` (#202020) for everything that matters. `grey-04` (#606060) is for secondary text and icons at rest (6.3:1 on white). Never set body text in `grey-03` (2.0:1); it is for placeholders, disabled text and dashed outlines only.
- **Lines**: `grey-02` (#dbdbdb) is the default border of every element (the base layer sets it), and the outline of cards, pills and inputs. Hover turns an outline to `text`.
- **Primary action** in the debates surfaces is a black pill (`text` fill, white label). In the editor and governance surfaces it is the `ctaPrimary` button (#3963fe, `ctaHover` #002fd9 on hover). Do not mix the two on one surface.
- **Meaning colours**: `green` (#2ace9d) for agree, success and online. `red-01` (#ff523a) for disagree, error and Controversial. Their pale grounds are `successTertiary` / `errorTertiary` / `red-02`. `purple` (#6833ff) with `purple-tint` marks needs-you rows. `orange` and `pink` appear only inside avatars, gradients and the spinner.
- **Contrast flags (source pairs, kept exact)**: `green` and `orange` are 2.0:1 on white, so never use them as text. White on `green` (the success button) is 2.0:1. `red-01` text is 3.2:1, so error footnotes miss 4.5:1. Use red-01 text only at 14px+ medium or as a mark.
- **Gradients** exist as utilities (`bg-gradient-geo`, `-blue`, `-green`, `-orange`, `-purple`, `-yellow`) for onboarding art and covers. Keep them out of controls.
- One theme: the app forces `color-scheme: light`. There is no dark mode.

### Type
- **Calibre** (400/500/600/700) is the only UI face (`--font-calibre`). **Geist** Medium/Bold is reserved for the phone navbar "Geo" wordmark and the open-rounds playback stamps.
- The scale lives in `styles.css` as `text-<name>` utilities, each with its own size, line height, weight and tracking. Use the named style, never a raw size:
  - Debates and panels: `metadata` (16/20, -0.25px) for pills and meta, `metadataMedium` for names and claim text, `footnote` (11/13) for countdowns and helper lines, `footnoteMedium` for space names, `browseSection` (13/13, -0.35px) for stat lines, `breadcrumb` (14/15 medium) for compact pills and dark tooltips.
  - Controls: `button` (17/19, 500, -0.17px) for button and menu labels and the Agree/Disagree pills, `input` (17/18) for fields, `quoteMedium` for tabs.
  - Pages: `mainPage` (52/56), `entityTitle` (44/46, stepping to 36/38 at ≤767px and 26/30 at ≤409px), `largeTitle` (32/40), `mediumTitle`, `smallTitle`, `body` (20/29).
- `design-system/theme/typography.ts` is an older JS mirror and disagrees in places (body 19px there, 20px in CSS; mainPage 44 vs 52; mediumTitle 24 vs 22.4). The CSS wins, because the classes resolve to it.

### Spacing, radii, borders, shadows
- Spacing is Tailwind's 4px scale (`--spacing: 0.25rem`). Cards pad `p-3` (12px). Pills sit `gap-2` (8px) apart. Icon and label sit at `gap-1.5`. Rows pad `py-2.5`. Tabs sit `gap-6` apart. Odd literals in the source are exact; keep them (Input `px-[10px] py-[9px]`, filter pill `px-[10px] py-[7px]`).
- **Radii**: `radius-full` for pills, faces and dots; `radius-lg` (12px) for cards, menus, dialogs and the parties strip; `radius` (6px) for classic buttons, inputs, dropdowns and toasts; `radius-sm` (4px) for tags and thumbnails; `radius-xl` (16px) for large wells.
- **Borders, not shadows**, separate things on the page: cards are `border border-grey-02` with no shadow. Shadows mark things that float: `shadow-lg` for menus, dropdowns and light tooltips, `shadow-card` for toasts and modal cards, `shadow-popover` for the debates Filters popover. Inputs and the dropdown trigger draw their outline as an inset shadow (`shadow-inner` grey-02, `shadow-inner-lg` text on focus).
- **Dashed** outlines mean "not chosen yet": the unpicked Agree/Disagree pills (`border-dashed border-grey-03`) and the Add type button.

### States
- Hover: outlines go to `text`. Quiet fills go to `grey-01` (pills, icon buttons, menu plates) or `bg` (classic buttons, dropdown rows). Black fills go to `bg-text/90`. Links underline.
- Selected: Agree/Disagree turns `bg-divider` with no border and a filled thumb. Facet pills flip to the black primary pill. Tabs turn `text` with a 1px `text` underline. Menu items show a `grey-01` plate.
- Disabled: pills `opacity-50`, position pills `opacity-60`, filter rows `opacity-40`, classic buttons `bg-divider text-grey-03`.
- Pending: swap the label ("Requesting…") and keep the width. Elsewhere, `Pending` dots replace the content in place. Skeletons are `animate-pulse bg-grey-02`.
- Focus: classic controls use an inset ring (`shadow-inner-text`, or `shadow-inner-ctaHover` on primary). The person-pick checkbox uses a 2px `purple` outline. The phone navbar pills use a 2px `text` ring with a 2px offset.

### Layout and breakpoints
- **Desktop-first.** Base classes are the desktop layout. `md:` means **max-width 767px** (phones), `lg:` ≤1023px, `xl:` ≤1279px, `mobile:` ≤639px. `max-md:` and the other `max-*` variants compile to nothing. Write `grid-cols-2 md:grid-cols-1`, never the reverse.
- Touch targets grow on phones: dialog actions are 28px on desktop and `md:h-11` (44px) on phones. Compact hub pills go from 26px to `md:h-8`.
- The debates side panel is 400px wide. Its claim surfaces use **container queries**, not the viewport: pills sit side by side from 272px (`claim-pills-wide`), the feed card drops its side-by-side layout under 520px (`claim-card-narrow`), and the end slot sits inline from 330px or 370px. Overview side rails are fluid between `width-side-rail-min` (280px) and `width-side-rail` (360px).
- Stacking (`zIndex`): menus and dialogs at 100, tooltips at 1001, slide-ups at 10000, popovers inside panels at 10003, the status bar at 10004, toasts at 10005.

### Motion
- Short and functional. Tooltips and popover menus spring in over 0.15s from 95% scale. Toasts slide from below. `fadeIn` takes 0.15s, and `riseIn` fades in while rising 5px in 200ms. Avoid decorative motion; open-rounds stamps and the turn timer are the only expressive animations.

## Iconography

- Use the app's own set (Assets, Icons). These are 16px outline glyphs with 1px strokes (12px for small variants and the thumbs), drawn in `currentColor`. Set their ink with a text colour: `text-grey-04` at rest, `text-text` on hover or active, white on black pills.
- Common glyphs: `calendar` (See times), `time` (countdowns), `ellipsis` (overflow menu), `close`/`close-small`, `search`, `chevron-down-small` (dropdown and filter triggers), `check` / `minus` / `blank` (checkbox states), `thumb-up` / `thumb-down` (Agree / Disagree; filled when picked), `fire` (Controversial), `megaphone` / `warning` / `member-tiny` at 13px (person stats), `relation-small` (relation chips).
- Never substitute emoji or another icon library. The Geo mark (Logos) is single-ink; use it as is and never redraw it.

## Building a mockup with this system

1. Load `tokens.css` and `components/bundle.css` (a Tailwind compile of the app's own stylesheet). Every class you copy from a component card then renders as in the app: `text-metadata`, `bg-grey-01`, `claim-card-panel-surface`, `md:` and the container variants included. For a new class not in the bundle, use the token values directly.
2. Start from the component cards and copy their markup and class strings. A debates screen is usually a 400px panel of `PersonRow`s, `MatchmakingClaimCard`s or `IncomingRequestCard`s, with `HubPillButton`s for actions and the `DebateRequestDialog` card for prompts.
3. Use real-shaped content: neutral names, full-sentence claims, Agree/Disagree, real counts and countdowns.
4. Design desktop first, then add the ≤767px variant. Check the panel at 400px.
5. Keep colour for meaning. If a screen needs a second accent, it is probably a pill that should be black.
