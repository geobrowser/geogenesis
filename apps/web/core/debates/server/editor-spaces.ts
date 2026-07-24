import { GraphQLClient } from 'graphql-request';

import { normalizeSpaceId } from '~/core/access/space-access';
import { getConfig } from '~/core/environment/environment';

const EDITOR_SPACES_QUERY = `
  query DebateAcceptorEditorSpaces($memberSpaceId: String!) {
    editors(filter: { memberSpaceId: { is: $memberSpaceId } }, first: 500) {
      spaceId
    }
  }
`;

/**
 * Every space the given member space is an editor of, straight from the knowledge graph. This is
 * how the publish sweep finds its work: the acceptor publishes only into spaces it can edit, so
 * enumerating its editor spaces is the whole candidate set — no manual allowlist to maintain.
 */
export async function listEditorSpaceIds(memberSpaceId: string): Promise<string[]> {
  const client = new GraphQLClient(getConfig().api);
  const data = await client.request<{ editors: Array<{ spaceId: string }> }>(EDITOR_SPACES_QUERY, {
    memberSpaceId: normalizeSpaceId(memberSpaceId),
  });
  return [...new Set(data.editors.map(editor => editor.spaceId))];
}
