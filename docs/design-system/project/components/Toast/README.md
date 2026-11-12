# Toast

A transient message: `inline-flex items-center gap-4 rounded bg-text p-2 pl-3 text-white shadow-card`, centred at the bottom (or top) of the viewport, above everything (`z-toast`, 10005), and gone after 5 seconds unless persistent.

**Copy** is one short sentence and may carry an action: "Link copied!", "Vote published!", "Google sign-in didn't complete. Try again.", "You’re going to <lobby>. We’ve emailed you a calendar invite."

**Use** `useToast()` / `useSetToast({ placement })`. The older `design-system/toast.tsx` (`rounded bg-text px-3 py-2 text-button text-white`, shown last in the preview) is the same look.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/core/hooks/use-toast.tsx` (geogenesis master).
