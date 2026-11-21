import { getCurrentGeoChatPersonId, getCurrentGeoChatUserId } from '~/core/debates/api';
import { normId } from '~/core/utils/norm-id';

/**
 * The signed-in viewer as the chat wire may name them: geo-chat's user id, or the person entity id
 * geo-chat moves to (GEO-3818). Either matches, so the web works against both geo-chat builds.
 */
export type ChatViewer = { userId: string; personId: string | null };

export function isViewerId(viewer: ChatViewer | null, id: string | null | undefined): boolean {
  if (!viewer || !id) return false;
  const wanted = normId(id);
  return normId(viewer.userId) === wanted || (viewer.personId !== null && normId(viewer.personId) === wanted);
}

/** The viewer's id for profile lookups, which are by person. */
export function viewerPersonId(viewer: ChatViewer | null): string | null {
  return viewer ? (viewer.personId ?? viewer.userId) : null;
}

/** The viewer from the stored session, for code outside React. */
export function currentChatViewer(): ChatViewer | null {
  const userId = getCurrentGeoChatUserId();
  return userId ? { userId, personId: getCurrentGeoChatPersonId() } : null;
}
