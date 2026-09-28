/**
 * The error's own name, read structurally.
 *
 * `instanceof Error` is the wrong guard for anything the platform throws. `DOMException` — which
 * is what `play()`, the Web Share API, `fetch` aborts and `getUserMedia` all reject with — is not
 * reliably an instance of it, and a rejection that crosses a realm is not an instance of *our*
 * `Error` at all. Guarding that way silently reports every one of them as unnamed: the share
 * failure Preston hit arrived as a person telling us the string, because `NotAllowedError` never
 * reached the event (GEO-2890).
 *
 * So read the property, which every one of them has. Classify on the result — never on the
 * message, which is prose the engine writes for a human and changes between versions. WebKit and
 * Chrome word the same refusal differently, and Chrome's *interruption* message and WebKit's
 * *refusal* message share phrases, so a substring test conflates the two.
 */
export function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string') {
    return error.name;
  }
  return 'UnknownError';
}
