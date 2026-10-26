The `livekit-client@2.20.1` patch is required by GEO-3404's in-place input switching.

Geogenesis gates turns, mute and camera-off through `MediaStreamTrack.enabled`. The SDK
previously sent a newly captured or processed track before restoring that gate, then
unconditionally enabled the capture after an asynchronous sender replacement. The patch
copies the current gate before processing/sending and preserves changes made while awaiting
replacement. Deliberate SDK unmute still works.

The readable source changes are in the `LocalTrack.ts` and `LocalAudioTrack.ts` hunks.
The matching ESM and UMD changes are necessary because the package exports both formats;
the minified UMD bundle accounts for almost all of the patch's size. Both entry points are
exercised by `apps/web/core/debates/local-track-restart.test.ts`, using the installed SDK
with fake capture tracks and senders rather than a mocked SDK implementation.

Keep this patch until an upstream version preserves the same gate before sender replacement.
Run those tests when upgrading or removing it. Use `bun install --frozen-lockfile` to apply it.
