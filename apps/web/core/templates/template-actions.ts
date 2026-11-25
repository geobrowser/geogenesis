/**
 * Which write actions the entity templates offer. Turn an action back on by setting it to `true`
 * here; nothing else needs to change.
 *
 * `addContext` and `dispute` are off for now (GEO-3819, product decision: hide them until they are
 * ready to ship). While off, every entry point is hidden — the
 * overflow menu items, the section `+` popovers, the "add another value" pill inside Context
 * blocks, and the Post "Add context note" button — and the Context / Disputes sections show only
 * when there is something in them to read.
 *
 * `addSource` is off for now (Preston, 25 Nov): the Sources "+" hands the link to the AI assistant,
 * which pulls the visitor into edit mode to review and publish. It comes back once ingestion
 * publishes on its own behind the scenes (Bryan's follow-up ticket).
 *
 * Read these flags at render time (not destructured at module load) so tests can flip them.
 */
export const TEMPLATE_ACTIONS: { addContext: boolean; dispute: boolean; addSource: boolean } = {
  addContext: false,
  dispute: false,
  addSource: false,
};
