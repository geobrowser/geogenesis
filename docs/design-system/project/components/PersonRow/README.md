# PersonRow

One person in the People tab or the debate calendar. Each row has a 32px face with the online dot, the name, a record line, and the actions on the right.

**Anatomy.** `<li>` grid `grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-2.5 py-2.5`, separated by `border-b border-grey-02` (none on the last row). Picking mode adds a 1rem checkbox column (`CheckboxVisual`, purple focus outline) and dims hidden rows to `opacity-60`.
- **Face**: `Avatar` 32px in `rounded-full`, `OnlineDot faceSize={32}` when online, and the follow control (`FollowButton variant="avatar"`) when the person can be followed. That control is not shown in the preview.
- **Name**: `metadataMedium`, truncating, underlined on hover, linking to the person's personal space.
- **Record line** (`person-record-line.tsx`): stats in `browseSection` grey-04 with 13px icons: megaphone (debates), warning (positions), member-tiny (followers), with values in text. Then a `·` and the matches popover, then the space icons.
- **Away**: a `footnote` grey-04 "Away" line, and Schedule replaces Debate now.
- **Actions**: the See times calendar icon button (`HUB_ICON_BUTTON_CLASS_NAME`), then a `HubPillButton`. That pill is primary "Debate now" ("Requesting…" while pending), or secondary and disabled with "In a debate" or "Away", or secondary "Schedule".

**The consumer provides** `person` (`DebatePerson`), `matches`, `record`, `schedule`/`times`, `spaceIds` + `labelsById`, `onSeeTimes`, `onRequireSignIn` when signed out, `disabled`/`disabledReason`, `layout` (`'default'|'panel'`), and optional `pick`.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/core/debates/matchmaking/people-tab.tsx` (geogenesis master).
