/**
 * Whether the Geo publisher edits a space (GEO-3593): `pending` while the add-editor vote is open,
 * `executable` once it passed and waits to be executed, `check_failed` when the proposals could not
 * be read. `unknown` never shows the notice.
 */
export type GeoPublisherStatus = 'editor' | 'pending' | 'executable' | 'check_failed' | 'not_editor' | 'unknown';

/** An add-editor proposal for the viewer to sign, and the viewer's YES vote to follow it. */
export type GeoPublisherProposal = {
  to: `0x${string}`;
  calldata: `0x${string}`;
  proposalId: `0x${string}`;
  authorSpaceId: string;
};
