# Button

The classic Geo button: a 6px-radius (`radius`) bordered rectangle in `button` type, used in the editor, governance and settings surfaces.

**When to use.** Entity, space and governance tools. Not in the debates surfaces: they use `HubPillButton` (black pill) and the dialog-action pills.

**Variants** (`variant`): `primary` (ctaPrimary fill, ctaHover on hover), `secondary` (white, grey-02 border that turns text on hover, `shadow-button`), `tertiary` (text fill), `ghost` (grey-04 text, no border until hover), `transparent` (text border), `success` (green), `error` (red-01), `done` (green with text ink). `disabled` swaps to a divider fill with grey-03 text. `small` makes a 24px-high button in `metadata` type (`SmallButton` defaults to `secondary`).

**Props** — `ButtonProps = ComponentPropsWithoutRef<'button'> & { variant?: 'primary'|'secondary'|'tertiary'|'ghost'|'transparent'|'done'|'success'|'error'; icon?: ReactNode; small?: boolean }`. `type="button"` by default.

**Related exports in the same file.**
- `SquareButton` — 24×24 icon box (`icon`, `isActive`).
- `IconButton` — borderless grey-04 icon.
- `AddTypeButton` — dashed 24px "+ label" button.
- `PILL_BUTTON_CLASS_NAME` — the navbar's black Log in pill (`#151515`, a literal), 28px, `rounded-full`, 16px/13px, -0.35px tracking. `PILL_BUTTON_SECONDARY_CLASS_NAME` is the same shape in secondary colours.
- `DIALOG_ACTION_BUTTON_CLASS_NAME` / `DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME` — a modal's full-width actions: a `rounded-full` pill, 28px on desktop and 44px on phones (`md:h-11`), `metadata` type, black or outlined. Use these for Accept, Not now, Skip and every onboarding step.
- `buttonClassNames(className)` — the classes, for a link that should look like a button.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/button.tsx` (geogenesis master).
