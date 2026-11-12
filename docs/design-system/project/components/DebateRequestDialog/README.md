# DebateRequestDialog

The modal card used by debate request and challenge prompts. It is a 370px card on a `divider` ground with a white inset showing both people, two pill actions, and a quiet underlined escape.

**Anatomy.** The overlay is `fixed inset-0 z-1200 bg-text/45 p-5 backdrop-blur-sm`, centred. The card is `grid w-[min(370px,100%)] gap-4 rounded-lg bg-divider p-5 shadow-card`, with a `metadata` title centred ("Debate request"). The inset is `rounded-lg border border-grey-02 bg-white p-3` with `grid-cols-[1fr_auto_1fr]`: two participants (20px face, name in `metadata`) around a 28px "VS" disc in `tag` type on a divider hairline. The footer has a `grid-cols-2 gap-2` pair of `DIALOG_SECONDARY_ACTION_BUTTON_CLASS_NAME` ("Not now") and `DIALOG_ACTION_BUTTON_CLASS_NAME` ("Explore claims"). Under them is an underlined grey-04 `metadata` text button ("Reject request").

**Phones.** The source writes `max-sm:` classes for a bottom sheet. `--breakpoint-*: initial` in `styles.css` resets the breakpoints, so `max-sm:` compiles to nothing (the trap the stylesheet warns about). On phones the card stays centred.

**In the preview,** `fixed inset-0` is replaced by a fixed-height box so the card fits the frame. The live camera preview (`DebateRequestMediaPreview`) is shown in its fallback, the face and name.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/core/debates/debate-challenge-dialog.tsx` (geogenesis master).
