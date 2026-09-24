import { createEntityId } from '~/core/id/create-id';
import type { Relation } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

/** The relation type created for GEO-3014. */
export const HIDDEN_FROM_PROFILE_PROPERTY = '79c2cdf1a40f4f93b7410df1b89821ed';
export const HIDDEN_FROM_PROFILE_PROPERTY_NAME = 'Hidden from profile';

/** A stable destination for the debates that disappear from the public profile. */
export function hiddenProfileDebatesPath(personalSpaceId: string): string {
  return `/space/${personalSpaceId}/debates?hidden=true`;
}

export type HiddenProfileRelation = {
  id: string;
  spaceId: string;
  toEntityId: string;
};

/**
 * Hide one debate from one person's profile.
 *
 * The personal-space system entity is both the source and the authoring space.
 * `toSpaceId` records where the debate itself lives, as every cross-space
 * relation created by this app does.
 */
export function buildHideDebateRelation(args: {
  personalSpaceId: string;
  debateId: string;
  debateName: string | null;
  debateSpaceId: string;
}): { hidden: HiddenProfileRelation; relation: Relation } {
  const id = createEntityId();

  return {
    hidden: { id, spaceId: args.personalSpaceId, toEntityId: args.debateId },
    relation: {
      id,
      entityId: createEntityId(),
      spaceId: args.personalSpaceId,
      toSpaceId: args.debateSpaceId,
      renderableType: 'RELATION',
      fromEntity: { id: args.personalSpaceId, name: null },
      toEntity: { id: args.debateId, name: args.debateName, value: args.debateId },
      type: { id: HIDDEN_FROM_PROFILE_PROPERTY, name: HIDDEN_FROM_PROFILE_PROPERTY_NAME },
      isLocal: true,
    },
  };
}

/** Delete every matching row so old duplicate writes cannot keep a debate hidden. */
export function buildUnhideDebateRelations(args: {
  personalSpaceId: string;
  debateId: string;
  debateName: string | null;
  hidden: readonly HiddenProfileRelation[];
}): Relation[] {
  return args.hidden.map(row => ({
    id: row.id,
    entityId: createEntityId(),
    spaceId: row.spaceId,
    renderableType: 'RELATION',
    fromEntity: { id: args.personalSpaceId, name: null },
    toEntity: { id: args.debateId, name: args.debateName, value: args.debateId },
    type: { id: HIDDEN_FROM_PROFILE_PROPERTY, name: HIDDEN_FROM_PROFILE_PROPERTY_NAME },
    isLocal: true,
    isDeleted: true,
  }));
}

/** Distinct participated debates minus this profile's hidden targets. */
export function visibleDebateCount(participatedIds: readonly string[], hiddenTargetIds: readonly string[]): number {
  const hidden = new Set(hiddenTargetIds.map(normId));
  return new Set(participatedIds.map(normId).filter(id => !hidden.has(id))).size;
}
