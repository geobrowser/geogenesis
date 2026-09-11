/**
 * Whether the FlowBar stays hidden. Editing counts from EITHER the main view's
 * edit toggle or the entity side panel's own pencil: the panel writes the same
 * local store, so pending edits made there need the same review-and-publish
 * path. (Before this, only the global toggle showed the bar, and a change made
 * from the panel alone had no way to be published.)
 */
export function shouldHideFlowBar(args: {
  opsCount: number;
  editable: boolean;
  sidePanelWantsEdit: boolean;
  hasToast: boolean;
  reviewState: string;
}): boolean {
  const isEditing = args.editable || args.sidePanelWantsEdit;
  return args.opsCount === 0 || !isEditing || args.hasToast || args.reviewState !== 'idle';
}
