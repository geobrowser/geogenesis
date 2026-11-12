#!/usr/bin/env python3
"""Writes project/components/<Comp>/README.md and tools/component-sources.json.

Usage: python3 -I tools/component-readmes.py
Each entry: (source path, guideline markdown). Props are copied from the component's TS types.
"""
import json
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC = ('\n\n*Static rendition: the preview is plain markup carrying the class strings copied from the source, '
          'styled by `bundle.css` (a Tailwind compile of the app\'s own `styles.css`). Hover and focus are shown as '
          'separate samples where it matters.*')

C = {
'Button': ('apps/web/design-system/button.tsx', """The classic Geo button: a 6px-radius (`radius`) bordered rectangle in `button` type, used in the editor, governance and settings surfaces.

**When to use.** Entity, space and governance tools. Not in the debates surfaces: they use `HubPillButton` (black pill) and the dialog-action pills.

**Variants** (`variant`): `primary` (ctaPrimary fill, ctaHover on hover), `secondary` (white, grey-02 border that turns text on hover, `shadow-button`), `tertiary` (text fill), `ghost` (grey-04 text, no border until hover), `transparent` (text border), `success` (green), `error` (red-01), `done` (green with text ink). `disabled` swaps to a divider fill with grey-03 text. `small` makes a 24px-high button in `metadata` type (`SmallButton` defaults to `secondary`).

**Props** — `ButtonProps = ComponentPropsWithoutRef<'button'> & { variant?: 'primary'|'secondary'|'tertiary'|'ghost'|'transparent'|'done'|'success'|'error'; icon?: ReactNode; small?: boolean }`. `type="button"` by default.

**Related exports in the same file.**
- `SquareButton` — 24×24 icon box (`icon`, `isActive`).
- `IconButton` — borderless grey-04 icon.
- `AddTypeButton` — dashed 24px "+ label" button.
- `PILL_BUTTON_CLASS_NAME` — the navbar's black Log in pill (`#151515`, a literal), 28px, `rounded-full`, 16px/13px, -0.35px tracking. `PILL_BUTTON_SECONDARY_CLASS_NAME` is the same shape in secondary colours.
- `DIALOG_ACTION_BUTTON_CLASS_NAME` / `DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME` — a modal's full-width actions: a `rounded-full` pill, 28px on desktop and 44px on phones (`md:h-11`), `metadata` type, black or outlined. Use these for Accept, Not now, Skip and every onboarding step.
- `buttonClassNames(className)` — the classes, for a link that should look like a button."""),
'TextButton': ('apps/web/design-system/text-button.tsx', """A bare text action in `smallButton` type: grey-04 that turns text on hover, or ctaPrimary that turns ctaHover on hover.

**When to use.** Secondary inline actions such as Clear or Done in a popover. The quiet underlined "Back to times" style beside a stack of pills is `HubQuietButton` (in `hub-pill-button.tsx`), shown last in the preview.

**Props** — `ComponentPropsWithoutRef<'button'> & { color?: 'grey-04' | 'ctaPrimary' }`; `disabled` gives `cursor-not-allowed text-grey-04`."""),
'HubPillButton': ('apps/web/core/debates/matchmaking/hub-pill-button.tsx', """The debates pill: `rounded-full` with a 1px border, `whitespace-nowrap`, 28px high in `metadata` type. This is the main button of every debates surface.

**When to use.** Any action in the debates hub, person rows, request cards, scheduling. `primary` (text fill, white label, `hover:bg-text/90`) is the one thing the row is for, such as Debate now or Accept. `secondary` (grey-02 border, `hover:bg-grey-01`) covers the rest: Schedule, Dismiss. `tag` is the secondary look without the hover, for a pill that holds a value.

**Sizes** (`size`): `default` `h-7 px-3 text-metadata`; `compact` `h-6.5 px-2.5 text-breadcrumb md:h-8 md:px-3` (Requests timeline); `large` `h-12 px-5 text-button`, full width, a dialog's lead choices ("I’m running late", "I can’t make it").

**The consumer provides** the label as children, plus `pending` and `pendingLabel` ("Requesting…", "Accepting…", "Dismissing…") while a mutation runs. The pill is disabled and `aria-busy` while pending; disabled is `opacity-50`.

**Props** — `{ variant?: 'primary'|'secondary'; size?: 'default'|'large'|'compact'; pending?: boolean; pendingLabel?: string; analyticsLabel?; analyticsSurface?; analyticsIntent? } & ComponentProps<'button'>`.

**Same file.** `hubPillClassName(variant, className, size)` for links ("Join debate"). `HUB_ICON_BUTTON_CLASS_NAME` is the 28px round grey-04 icon control (Close, See times, calendar). `HubQuietButton` is the underlined text escape. `FacetPill` (`facet-pill.tsx`) is this pill with a count: `primary` when picked (count `text-white/70`), `secondary` otherwise (count `text-grey-04`)."""),
'PersonRow': ('apps/web/core/debates/matchmaking/people-tab.tsx', """One person in the People tab or the debate calendar. Each row has a 32px face with the online dot, the name, a record line, and the actions on the right.

**Anatomy.** `<li>` grid `grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-2.5 py-2.5`, separated by `border-b border-grey-02` (none on the last row). Picking mode adds a 1rem checkbox column (`CheckboxVisual`, purple focus outline) and dims hidden rows to `opacity-60`.
- **Face**: `Avatar` 32px in `rounded-full`, `OnlineDot faceSize={32}` when online, and the follow control (`FollowButton variant="avatar"`) when the person can be followed. That control is not shown in the preview.
- **Name**: `metadataMedium`, truncating, underlined on hover, linking to the person's personal space.
- **Record line** (`person-record-line.tsx`): stats in `browseSection` grey-04 with 13px icons: megaphone (debates), warning (positions), member-tiny (followers), with values in text. Then a `·` and the matches popover, then the space icons.
- **Away**: a `footnote` grey-04 "Away" line, and Schedule replaces Debate now.
- **Actions**: the See times calendar icon button (`HUB_ICON_BUTTON_CLASS_NAME`), then a `HubPillButton`. That pill is primary "Debate now" ("Requesting…" while pending), or secondary and disabled with "In a debate" or "Away", or secondary "Schedule".

**The consumer provides** `person` (`DebatePerson`), `matches`, `record`, `schedule`/`times`, `spaceIds` + `labelsById`, `onSeeTimes`, `onRequireSignIn` when signed out, `disabled`/`disabledReason`, `layout` (`'default'|'panel'`), and optional `pick`."""),
'MatchmakingClaimCard': ('apps/web/core/debates/matchmaking/matchmaking-claim-card.tsx', """The hub's claim card: a space eyebrow, the claim, the Agree/Disagree row and the summary band. It is the most-used debates surface.

**Anatomy** (shared utilities in `styles.css` keep the feed and the hub in step):
- `claim-card-panel-surface` = `rounded-lg border border-grey-02 bg-white p-3`.
- `claim-card-panel-header` = `mb-2 flex flex-nowrap items-start justify-between gap-3` (here also `items-baseline`). It holds `SpaceChip` (optional 16px `rounded-sm` thumbnail plus the space name in `footnoteMedium` grey-04), an optional `ControversialTag` (fire icon plus "Controversial" in red-01 at 14px), optional `· meta`, and the end slot on the right. The end slot is the small black "Debate now" pill: `h-5 px-2.5 text-[14px] rounded-full bg-text text-white`, sized against "Requesting…" so it never jumps.
- `claim-card-panel-title` = `mb-3 line-clamp-3 block text-metadataMedium leading-snug text-pretty`, linking to the claim and underlined on hover.
- `PositionRow`: the Agree/Disagree pills (see its card).
- `ClaimSummary` inline in `claim-card-summary-band` = `border-t border-divider bg-grey-01 px-3 py-2`, bled to the card edge (`-mx-3 mt-3 -mb-3 rounded-b-[inherit]`). It shows the agree share ("62%" in metadataMedium, "agree" in metadata grey-04), a 2px split bar (green and red-01), and the responders' avatar stack.

**Narrow.** Below 520px of card width (`claim-card-narrow:`) the feed card drops its side-by-side layout. Below 272px (`claim-pills-wide`) the pills stack.

**The consumer provides** `claim` (`DebateClaimSummary`), `positions`, `readiness`, `analyticsSurface`, and optionally `endSlot`, `footer`, `headerMeta`, `hideSummary`, `onOpenClaim`."""),
'PositionRow': ('apps/web/core/debates/matchmaking/matchmaking-claim-card.tsx', """The Agree/Disagree pair. Each side is a `rounded-full` pill in `button` type showing a thumb icon, the label and up to two faces of people on that side, then a +N.

**States.** Unpicked: `border-dashed border-grey-03 bg-white`, `hover:border-text`. Picked: `border-transparent bg-divider` with the thumb filled, and the face rings switch to `border-divider`. Pending or disabled: `opacity-60`.

**Layout.** It is a container query, not a viewport query. One column until the row is 272px wide (`claim-pills-wide:grid-cols-2`). With an end slot (comments and share) it becomes three columns from 330px (`claim-row-end-inline`), or from 370px with a third action. The faces hide inside a narrow pill (`@max-[102px]`, `@max-[115px]`, `@max-[128px]`) so the label never truncates to "Dis…".

**Copy.** Always "Agree" and "Disagree" (`CLAIM_RESPONSE_COPY`). The old Verify/Dispute wording is gone.

**Props** — `{ positions; responseKind; viewerPosition: boolean|null; onRespond?; disabled?; pending?; titleFor?; noteFor?; localSide?; endSlot?; endSlotWraps?: 'compact'|'wide'; showParticipants?; analyticsSurface? }`."""),
'ClaimSummary': ('apps/web/core/claims/browse/claim-summary.tsx', """How a claim's responses split: the agree percentage, a green/red-01 split bar and the responder avatars.

**Layouts.** `inline` is a 2px bar between the reading and the avatars, used inside `claim-card-summary-band` and setting `--avatar-group-ring` to grey-01. `stacked` is a 6px bar with the reading and the avatars beneath it. Nothing renders until there are counts (the "invite" tier renders nothing).

**Props** — `{ entityId; spaceId; responseKind; summary: ClaimResponseSummary; className?; layout?: 'stacked'|'inline' }`. Also exported: `ClaimSplitBar({ percent, className })`, `ControversialTag`, `ClaimSides`."""),
'IncomingRequestCard': ('apps/web/core/debates/matchmaking/incoming-request-card.tsx', """A debate request someone sent you, in the Requests tab: space, countdown, claim, both sides, and Dismiss/Accept.

**Anatomy.** `flex flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3`.
- Top row: `SpaceChip`, then the countdown in `footnote` text with the time icon ("Expires in 4m", "Expires in 38s", "Expired").
- The claim in `metadataMedium`.
- `RequestParties`: a `rounded-lg bg-grey-01` strip. "You" sits on the left and the requester on the right, each with a 20px face, the name in `footnote`, and their side in a `rounded-full bg-grey-02 px-1.5 py-0.5` chip. A 24px "VS" disc on a grey-02 hairline divides them, and the overflow "…" menu sits at the end.
- When the requester is busy: a grey-04 footnote ("Dev Raman is in a debate. You can accept once they’re free."), and Accept reads "Pending" and is disabled.
- `grid grid-cols-2 gap-2`: secondary "Dismiss" and primary "Accept" (`HubPillButton`).

**Overflow menu** (`request-overflow-menu.tsx`): "I don't want to debate this claim", and "Block <name>" in red-01.

**Props** — `{ request: DebateRequest; ref? }`."""),
'DebateRequestDialog': ('apps/web/core/debates/debate-challenge-dialog.tsx', """The modal card used by debate request and challenge prompts. It is a 370px card on a `divider` ground with a white inset showing both people, two pill actions, and a quiet underlined escape.

**Anatomy.** The overlay is `fixed inset-0 z-1200 bg-text/45 p-5 backdrop-blur-sm`, centred. The card is `grid w-[min(370px,100%)] gap-4 rounded-lg bg-divider p-5 shadow-card`, with a `metadata` title centred ("Debate request"). The inset is `rounded-lg border border-grey-02 bg-white p-3` with `grid-cols-[1fr_auto_1fr]`: two participants (20px face, name in `metadata`) around a 28px "VS" disc in `tag` type on a divider hairline. The footer has a `grid-cols-2 gap-2` pair of `DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME` ("Not now") and `DIALOG_ACTION_BUTTON_CLASS_NAME` ("Explore claims"). Under them is an underlined grey-04 `metadata` text button ("Reject request").

**Phones.** The source writes `max-sm:` classes for a bottom sheet. `--breakpoint-*: initial` in `styles.css` resets the breakpoints, so `max-sm:` compiles to nothing (the trap the stylesheet warns about). On phones the card stays centred.

**In the preview,** `fixed inset-0` is replaced by a fixed-height box so the card fits the frame. The live camera preview (`DebateRequestMediaPreview`) is shown in its fallback, the face and name."""),
'Chip': ('apps/web/design-system/chip.tsx', """Entity chips: `LinkableChip` (a linked entity name) and `LinkableRelationChip` (a relation value with its relation and space controls).

**Look.** `rounded border border-grey-02 bg-white`. Hover gives `border-text`. Focus gives `border-text bg-ctaTertiary shadow-inner-lg`. `LinkableChip` is `px-1.5 py-1 text-metadataMedium leading-4.5! font-normal!` and clamps to 4 lines from 42 characters. `LinkableRelationChip` is `pl-1.5 py-0.5 text-metadata tabular-nums` (`py-px` when `small`), with a grey-03 relation icon that turns text on hover. In edit mode it adds a space picker and delete (×).

**Props** — `LinkableChip { href; children; disableLink? }`. `LinkableRelationChip { isEditing; currentSpaceId; entityId; spaceId?; relationEntityId?; relationId?; verified?; onDelete?; onDone?; small?; className?; disableLink?; truncateLabel?; children }`. `LinkableMediaChip` (an 80px image/video tile) is not previewed."""),
'Tag': ('apps/web/design-system/tag.tsx', """A tiny label: `inline-block rounded-sm px-1 pb-px text-[0.875rem] leading-none`, on `bg-grey-02` unless the caller passes a `bg-` class.

**When to use.** Type labels in search results ("Space", a type name, "+2") and the debates hub's "New" match tag. `tagStyles(className)` gives the classes for an element with its own ref.

**Props** — `ComponentPropsWithoutRef<'div'>`."""),
'SpacePill': ('apps/web/design-system/space-pill.tsx', """The side rail's space pill: a 16px avatar and the name in a `rounded-full border-grey-02` outline, at 16px/18px, with `hover:border-text`.

**When to use.** Join spaces on Explore and Subspaces on a space overview. `SpacePillList` wraps the pills (`flex flex-wrap gap-2`) and folds anything beyond 9 behind "Show more"/"Show less". `SpacePillSectionHeading` is the sticky 19px/23px semibold heading above it.

**The consumer provides** the element (a button for Join, a link for Subspaces) with `SPACE_PILL_CLASS`, plus `SpacePillAvatar` and `SpacePillLabel`, which truncates with `min-w-0`."""),
'FilterMenu': ('apps/web/design-system/filter-menu.tsx', """A faceted filter: a pill trigger showing the current selection, opening a `Menu` of rows with a check or checkbox and an optional count.

**Trigger** (`FILTER_PILL_CLASS`): `rounded-full border border-grey-02 px-[10px] py-[7px] text-[16px] leading-[20px] text-[#2A2B2E] hover:bg-grey-01`, with a small chevron. `trigger="button"` uses `SmallButton` instead. Rows are `rounded px-2 py-2 text-[16px] leading-[20px] hover:bg-grey-01`, disabled at `opacity-40`, with the count right-aligned in 14px grey-04 tabular numerals. Multi-select uses `CheckboxVisual` rows and an optional "All" row above a divider hairline. `#2A2B2E` is a literal in the source, not a token.

**Props** — `{ label; options: {key,label,count?,disabled?}[]; trigger?: 'pill'|'button'; triggerClassName?; contentClassName?; maxHeightClass?; closeOnSelect? }` plus either `{ selectedKey, onSelect }` or `{ multiple: true, selectedKeys, onToggle, allLabel?, onSelectAll?, emptyMeansAll? }`."""),
'Dialog': ('apps/web/design-system/dialog.tsx', """The generic Radix dialog: an overlay of `bg-text/20` and a white `rounded-lg p-4` card up to 586px wide and 415px tall, placed 160px from the top (`mt-40`). The header row ends with a `SquareButton` close.

**When to use.** Pickers and tool dialogs in the editor. Debates prompts use the modal card in `DebateRequestDialog` instead.

**Props** — `{ title?; trigger: ReactNode; header: ReactNode; content: ReactNode }`. It holds its own open state."""),
'Menu': ('apps/web/design-system/menu.tsx', """The popover menu shell and its items: `rounded-lg border border-grey-02 bg-white shadow-lg`, at most 360px wide, scrolling at `min(400px,75vh)`, opening 8px from the trigger and flipping to fit.

**MenuItem.** `px-3 py-[10px] text-button text-text`. Hover or active shows a `bg-grey-01` plate inset 4px (`absolute inset-1 rounded`), not a full-bleed fill. An icon and label sit at `gap-2`. Destructive rows (the request overflow menu) use red-01 text.

**Props** — `Menu { trigger; open; onOpenChange; align?; sideOffset? (8); className?; viewportClassName?; asChild?; modal? }`, `MenuItem { active?; href?; onClick?; className?; closeOnSelect?; children }`."""),
'Dropdown': ('apps/web/design-system/dropdown.tsx', """A select-style dropdown. The trigger is a white `rounded` button with an inset grey-02 outline (`shadow-inner-grey-02`, text on hover, 2px text on focus) and a ctaPrimary chevron. The list is 273px wide with grey-02 rules between rows.

**Rows** are `min-h-10 px-3 py-2 text-button text-grey-04`, turning `bg-bg` and text on hover. A disabled row shows its `sublabel` on the right in `smallButton` grey-04.

**Props** — `{ trigger; align?; scrollableList?; options: { label; sublabel?; value; disabled; onClick }[] }`."""),
'Tooltip': ('apps/web/design-system/tooltip.tsx', """A Radix tooltip in three variants. `dark` (default) is a text-fill box, white `breadcrumb` type, centred, at most 192px, with an arrow. `light` is a white card with `shadow-lg` and `metadata` type, at most 250px. `propertyDescription` is a 350px bordered card that clamps to 3 lines.

**Props** — `{ trigger; label; position?: 'top'|'bottom'|'left'|'right' ('bottom'); align?; variant?; openOnPress? (touch toggles); delayDuration? (300) }`. Blocked actions explain themselves in a tooltip on press ("Ben is away. You can request a debate when they're back.")."""),
'Toast': ('apps/web/core/hooks/use-toast.tsx', """A transient message: `inline-flex items-center gap-4 rounded bg-text p-2 pl-3 text-white shadow-card`, centred at the bottom (or top) of the viewport, above everything (`z-toast`, 10005), and gone after 5 seconds unless persistent.

**Copy** is one short sentence and may carry an action: "Link copied!", "Vote published!", "Google sign-in didn't complete. Try again.", "You’re going to <lobby>. We’ve emailed you a calendar invite."

**Use** `useToast()` / `useSetToast({ placement })`. The older `design-system/toast.tsx` (`rounded bg-text px-3 py-2 text-button text-white`, shown last in the preview) is the same look."""),
'TabGroup': ('apps/web/design-system/tab-group.tsx', """The page tab row for entities and spaces. Tabs are `quoteMedium` labels 24px apart (`gap-6`): grey-04 when inactive, text when active, with a 1px text underline that moves under the active tab on a full-width grey-02 rule. A disabled tab is `opacity-25`.

**Extras.** A `Badge` count (`rounded bg-black px-1.25 py-0.5 text-xs text-white`), a `TabGroupDivider` (`h-4 w-px bg-grey-02`), and white edge fades with drag-to-scroll when the row overflows. `onlyWhenNarrow` tabs appear only at the `lg:` width.

**Props** — `{ tabs: { href; label; badge?; disabled?; hidden?; dividerBefore?; onlyWhenNarrow?; sidePanelKey? }[]; className? }`."""),
'Input': ('apps/web/design-system/input.tsx', """The text field. It draws its border with an inset shadow: 1px grey-02 at rest, text on hover, and 2px text on focus. It is `rounded`, `px-[10px] py-[9px]` and set in `input` type, with grey-03 placeholders. Disabled gives a divider fill and grey-03 text.

**Props** — native input props plus `withSearchIcon?` (a search glyph at left 12px, `pl-9`), `withExternalSearchIcon?`, `withFilterIcon?` (`rounded-r-none`), and `inputRef?`. `inputStyles` is exported for other fields."""),
'Checkbox': ('apps/web/design-system/checkbox.tsx', """A 16px box with a 4px radius and a 1px text border. It shows the check icon when `true`, blank when `false`, and a minus when `null` (mixed).

**Variants.** `CheckboxVisual` is the non-interactive mark for rows that are themselves the button. `variant="filled"` is the debates Filters popover's 14px box: grey-03 edge when off, a solid text fill with a white tick when on.

**Props** — `Checkbox { checked: boolean|null; onChange?; className? }`, `CheckboxVisual { checked; className?; variant?: 'default'|'filled' }`. `getChecked('1'|'0')` parses stored values."""),
'Toggle': ('apps/web/design-system/toggle.tsx', """A 16×10 switch with an 8px white knob. The track is text (#202020) when on and grey-03 when off (inline styles from `colors.ts`), and the knob springs across in 0.2s. An invisible `-inset-2` catcher enlarges the hit area.

**Props** — `{ checked: boolean } & ComponentPropsWithoutRef<'div'>`. The parent owns the click."""),
'Avatar': ('apps/web/design-system/avatar.tsx', """A person's or space's picture. When there is no image, it is a generated boring-avatars "beam" face in the app palette (ctaPrimary, purple, pink, orange, green), seeded by `value`.

**Use.** Always clip it in a `rounded-full` box of the same size (32px in PersonRow, 20px in request parties, 16px in claim pills, 12px in responder stacks). Pass `square` for spaces.

**Props** — `{ avatarUrl?; value?; alt?; size? (12); priority?; square? }`. The preview shows the generated fallback, rendered by the real component."""),
'AvatarGroup': ('apps/web/design-system/avatar-group.tsx', """An overlapping stack of faces (`-space-x-2`). Each face has a 2px ring in the surface colour, read from `--avatar-group-ring` (white by default). A grey-02 `+N` chip ends the stack.

**Sizes.** `AvatarGroup.Item size={12|20}`, and `AvatarGroup.Overflow count size` (12px: 9px text; 20px: 11px text). Set `--avatar-group-ring` to the ground the stack sits on (the summary band sets grey-01).

**Props** — `AvatarGroup { children; variant?: 'overlap'|'spaced' }`."""),
'OnlineDot': ('apps/web/design-system/online-dot.tsx', """The green "online now" dot, notched into the top-left of a face. The dot is a quarter of the face and its ring is half the dot, in the colour of the ground behind it.

**Sizes.** A 16px face gets a 4px dot in a 2px ring. A 32px face gets 8px in a 4px ring. The caller gives a `relative` box the size of the face and states the ring colour (`border-white`, or `border-divider` on a picked Agree/Disagree pill).

**Props** — `{ faceSize: number; ringClassName? ('border-white') }`. Show it only where presence is known, never on every avatar."""),
'Notice': ('apps/web/design-system/notice.tsx', """A full-page message (404, errors, empty homes): an optional visual, a centred `largeTitle`, an optional `body` description in grey-04, then an action and a footer, inside `max-w-md`, vertically centred in 75vh.

**Props** — `{ visual?; title; description?; action?; footer?; backgroundLayers? }`. Real titles: "Something went wrong", "Reconnecting", "This page could not be found :-(". The 404 action is a primary `Button` "Go to Explore"."""),
'Pending': ('apps/web/design-system/pending.tsx', """Keeps a control's size while it waits. The child goes `invisible` and three 4px bouncing `Dots` (grey-03, or grey-02) sit in its place.

**Props** — `Pending { isPending?; position?: 'start'|'center'|'end'; className?; children }`, `Dots { color?: 'bg-grey-03'|'bg-grey-02' }`. Pills prefer a pending label ("Requesting…") over dots."""),
'Skeleton': ('apps/web/design-system/skeleton.tsx', """The loading placeholder: `animate-pulse bg-grey-02`, `rounded-sm` (default) or `rounded-full`. Size it with classes to match the text it stands for (`h-3 w-20` for a space name).

**Props** — `{ radius?: 'rounded-full'|'rounded-sm'; className? } & HTMLAttributes<HTMLDivElement>`. Directory `design-system/skeletons/` holds composed page skeletons (not previewed)."""),
'Spinner': ('apps/web/design-system/spinner.tsx', """A 16×17 ring stroked with a ctaPrimary-to-pink gradient, rotating once a second. It is the one place a gradient appears in UI chrome.

**Props** — none. Prefer `Pending` dots or a pending label inside controls."""),
'Divider': ('apps/web/design-system/divider.tsx', """A rule: `solid` is a 0.5px divider border, and `dashed` is a top `border-dashed border-grey-02`. Set `type` to `'horizontal'` or `'vertical'`.

**Props** — `{ type: 'horizontal'|'vertical'; style?: 'solid'|'dashed'; className? }`. Most dividers in the app are plain `border-b border-grey-02` on list rows (PersonRow) or `border-divider` hairlines."""),
'Text': ('apps/web/design-system/text.tsx', """Typography as a component: `<Text variant color as>` maps to the `text-<variant>` and `text-<color>` utilities. Sizes come from `styles.css`, not from `typography.ts`.

**Props** — `{ children; variant?: TypographyName; color?: ColorName; as?: 'h1'|'h2'|'h3'|'p'|'span'|'div'|'a'|'li'; ellipsize?; className? }`. Newer debates code writes the utilities directly (`text-metadata text-grey-04`). Both are fine."""),
}

sources = {}
for comp, (src, body) in C.items():
    d = os.path.join(root, 'project', 'components', comp)
    os.makedirs(d, exist_ok=True)
    sources[comp] = src
    open(os.path.join(d, 'README.md'), 'w').write(f'# {comp}\n\n{body}{STATIC}\n\nSource: `{src}` (geogenesis master).\n')
json.dump(sources, open(os.path.join(root, 'tools', 'component-sources.json'), 'w'), indent=2)
print(len(C))
