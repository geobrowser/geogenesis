# Checkbox

A 16px box with a 4px radius and a 1px text border. It shows the check icon when `true`, blank when `false`, and a minus when `null` (mixed).

**Variants.** `CheckboxVisual` is the non-interactive mark for rows that are themselves the button. `variant="filled"` is the debates Filters popover's 14px box: grey-03 edge when off, a solid text fill with a white tick when on.

**Props** — `Checkbox { checked: boolean|null; onChange?; className? }`, `CheckboxVisual { checked; className?; variant?: 'default'|'filled' }`. `getChecked('1'|'0')` parses stored values.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/checkbox.tsx` (geogenesis master).
