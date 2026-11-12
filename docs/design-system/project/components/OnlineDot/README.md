# OnlineDot

The green "online now" dot, notched into the top-left of a face. The dot is a quarter of the face and its ring is half the dot, in the colour of the ground behind it.

**Sizes.** A 16px face gets a 4px dot in a 2px ring. A 32px face gets 8px in a 4px ring. The caller gives a `relative` box the size of the face and states the ring colour (`border-white`, or `border-divider` on a picked Agree/Disagree pill).

**Props** — `{ faceSize: number; ringClassName? ('border-white') }`. Show it only where presence is known, never on every avatar.

*Static rendition: the preview is plain markup carrying the class strings copied from the source, styled by `bundle.css` (a Tailwind compile of the app's own `styles.css`). Hover and focus are shown as separate samples where it matters.*

Source: `apps/web/design-system/online-dot.tsx` (geogenesis master).
