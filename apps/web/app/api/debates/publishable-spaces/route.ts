import { NextResponse } from 'next/server';

import { getDebateAcceptorConfig } from '~/core/debates/server/acceptor-config';
import { listEditorSpaceIds } from '~/core/debates/server/editor-spaces';

/**
 * The spaces a finished debate could actually be published into.
 *
 * A debate is published by the acceptor service account into the *claim's home space*, and that
 * needs editor rights there — a member can propose but not vote and execute, so anything else
 * reverts on-chain. So the set of spaces that can host a debate is exactly the set the acceptor
 * edits, which is the same set the publish sweep uses to discover its work (`listEditorSpaceIds`).
 * One source of truth for "can this claim carry a debate", read by both ends.
 *
 * This exists because `DEBATE_ACCEPTOR_SPACE_ID` is server-only and should stay that way. The
 * client needs the *answer*, not the acceptor's identity, so the resolution happens here.
 *
 * Nothing here is sensitive: it is a list of public space ids, and it says only which spaces are
 * debatable — which is already observable by trying. No auth, so it can be cached and shared.
 */

/** Editor sets change when someone is added to a space, which is rare. */
export const revalidate = 300;

export async function GET() {
  const config = getDebateAcceptorConfig();

  // `null`, not `[]`. An empty array is a real answer meaning "nothing is debatable"; a missing
  // acceptor means the question cannot be answered here, and callers must fall through to their
  // other filters rather than emptying every list. Local and preview environments run without an
  // acceptor configured, and they should still show a usable picker.
  if (!config) {
    return NextResponse.json({ spaceIds: null });
  }

  try {
    const spaceIds = await listEditorSpaceIds(config.spaceId);
    return NextResponse.json({ spaceIds });
  } catch (error) {
    // Same reasoning as above: a failed lookup is "unknown", not "nothing is publishable".
    console.error('[debates] could not resolve publishable spaces', error);
    return NextResponse.json({ spaceIds: null });
  }
}
