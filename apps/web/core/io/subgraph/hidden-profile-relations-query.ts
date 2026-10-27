import { HIDDEN_FROM_PROFILE_PROPERTY } from '~/core/profile/profile-debate-visibility';

function connection(spaceId: string, nodeFields: string): string {
  const space = JSON.stringify(spaceId);

  return `relationsConnection(
      filter: {
        typeId: { is: "${HIDDEN_FROM_PROFILE_PROPERTY}" }
        fromEntityId: { is: ${space} }
        spaceId: { is: ${space} }
      }
      first: 1000
    ) {
      nodes { ${nodeFields} }
    }`;
}

/** Full rows are needed to tombstone a hide relation when the owner restores a debate. */
export function hiddenProfileRelationRowsConnection(spaceId: string): string {
  return connection(spaceId, 'id spaceId toEntityId');
}

/** Profile counts only need the debate ids removed from the participated set. */
export function hiddenProfileRelationTargetsConnection(spaceId: string): string {
  return connection(spaceId, 'toEntityId');
}
