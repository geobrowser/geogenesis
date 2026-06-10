/**
 * Rank publish op builders aligned with backend `createRank` / `updateRank`.
 * Mirrors @geoprotocol/geo-sdk ranks module (blockId, vote spaceId, updateRank).
 */
import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import {
  type Op,
  createEntity as grcCreateEntity,
  createRelation as grcCreateRelation,
  deleteEntity as grcDeleteEntity,
  deleteRelation as grcDeleteRelation,
  languages,
} from '@geoprotocol/grc-20';

import { RANK_VOTES_RELATION_TYPE_ID, SUBMITTED_TO_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Entity } from '~/core/types';

export type RankVote = {
  entityId: string;
  spaceId: string;
};

export type ExistingVoteRelation = {
  relationId: string;
  voteEntityId: string;
};

export type CreateRankParams = {
  id?: string;
  name: string;
  description?: string;
  rankType?: 'ORDINAL' | 'WEIGHTED';
  blockId: string;
  votes: RankVote[];
};

export type UpdateRankParams = {
  rankId: string;
  rankType?: 'ORDINAL' | 'WEIGHTED';
  votes: RankVote[];
  existingVotes: ExistingVoteRelation[];
};

function validateVotes(votes: RankVote[], context: string): void {
  const seen = new Set<string>();
  for (const vote of votes) {
    IdUtils.assertValid(vote.entityId, `\`entityId\` in \`votes\` in \`${context}\``);
    IdUtils.assertValid(vote.spaceId, `\`spaceId\` in \`votes\` in \`${context}\``);
    const key = `${vote.entityId}:${vote.spaceId}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate (entityId, spaceId) in votes: "${key}". Each entity can only be voted once per space perspective in a rank.`
      );
    }
    seen.add(key);
  }
}

function buildVoteOps(rankId: string, votes: RankVote[]): { ops: Op[]; voteIds: string[] } {
  const ops: Op[] = [];
  const voteIds: string[] = [];
  let previousPosition: string | null = null;

  votes.forEach(vote => {
    const voteEntityId = IdUtils.generate();
    const relationId = IdUtils.generate();
    const position = Position.generate({ after: previousPosition });
    previousPosition = position;

    voteIds.push(voteEntityId);

    ops.push(
      grcCreateRelation({
        id: IdUtils.toGrcId(relationId),
        entity: IdUtils.toGrcId(voteEntityId),
        from: IdUtils.toGrcId(rankId),
        to: IdUtils.toGrcId(vote.entityId),
        relationType: IdUtils.toGrcId(RANK_VOTES_RELATION_TYPE_ID),
        toSpace: IdUtils.toGrcId(vote.spaceId),
        position,
      })
    );

    ops.push(
      grcCreateEntity({
        id: IdUtils.toGrcId(voteEntityId),
        values: [
          {
            property: IdUtils.toGrcId(SystemIds.VOTE_ORDINAL_VALUE_PROPERTY),
            value: {
              type: 'text',
              value: position,
              language: languages.english(),
            },
          },
        ],
      })
    );
  });

  return { ops, voteIds };
}

export function createRank({
  id: providedId,
  name,
  description,
  rankType = 'ORDINAL',
  blockId,
  votes,
}: CreateRankParams): { id: string; ops: Op[]; voteIds: string[] } {
  if (providedId) {
    IdUtils.assertValid(providedId, '`id` in `createRank`');
  }
  IdUtils.assertValid(blockId, '`blockId` in `createRank`');
  validateVotes(votes, 'createRank');

  const id = providedId ?? IdUtils.generate();
  const ops: Op[] = [];

  const rankValues = [
    {
      property: IdUtils.toGrcId(SystemIds.NAME_PROPERTY),
      value: {
        type: 'text' as const,
        value: name,
        language: languages.english(),
      },
    },
    {
      property: IdUtils.toGrcId(SystemIds.RANK_TYPE_PROPERTY),
      value: {
        type: 'text' as const,
        value: rankType,
        language: languages.english(),
      },
    },
  ];

  if (description) {
    rankValues.push({
      property: IdUtils.toGrcId(SystemIds.DESCRIPTION_PROPERTY),
      value: {
        type: 'text' as const,
        value: description,
        language: languages.english(),
      },
    });
  }

  ops.push(
    grcCreateEntity({
      id: IdUtils.toGrcId(id),
      values: rankValues,
    })
  );

  ops.push(
    grcCreateRelation({
      id: IdUtils.toGrcId(IdUtils.generate()),
      entity: IdUtils.toGrcId(IdUtils.generate()),
      from: IdUtils.toGrcId(id),
      to: IdUtils.toGrcId(SystemIds.RANK_TYPE),
      relationType: IdUtils.toGrcId(SystemIds.TYPES_PROPERTY),
    })
  );

  ops.push(
    grcCreateRelation({
      id: IdUtils.toGrcId(IdUtils.generate()),
      entity: IdUtils.toGrcId(IdUtils.generate()),
      from: IdUtils.toGrcId(id),
      to: IdUtils.toGrcId(blockId),
      relationType: IdUtils.toGrcId(SUBMITTED_TO_PROPERTY_ID),
    })
  );

  const { ops: voteOps, voteIds } = buildVoteOps(id, votes);
  ops.push(...voteOps);

  return { id, ops, voteIds };
}

export function updateRank({ rankId, votes, existingVotes }: UpdateRankParams): {
  id: string;
  ops: Op[];
  voteIds: string[];
} {
  IdUtils.assertValid(rankId, '`rankId` in `updateRank`');
  for (const existing of existingVotes) {
    IdUtils.assertValid(existing.relationId, '`relationId` in `existingVotes` in `updateRank`');
    IdUtils.assertValid(existing.voteEntityId, '`voteEntityId` in `existingVotes` in `updateRank`');
  }
  validateVotes(votes, 'updateRank');

  const ops: Op[] = [];

  for (const existing of existingVotes) {
    ops.push(grcDeleteRelation(IdUtils.toGrcId(existing.relationId)));
    ops.push(grcDeleteEntity(IdUtils.toGrcId(existing.voteEntityId)));
  }

  const { ops: voteOps, voteIds } = buildVoteOps(rankId, votes);
  ops.push(...voteOps);

  return { id: rankId, ops, voteIds };
}

export function getExistingVoteRelations(rankEntity: Entity): ExistingVoteRelation[] {
  return (rankEntity.relations ?? [])
    .filter(
      relation =>
        !relation.isDeleted &&
        relation.fromEntity.id === rankEntity.id &&
        relation.type.id === RANK_VOTES_RELATION_TYPE_ID &&
        Boolean(relation.entityId)
    )
    .map(relation => ({
      relationId: relation.id,
      voteEntityId: relation.entityId,
    }));
}
