import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';

import {
  AVATAR_PROPERTY_ID,
  BOUNTY_ALLOCATED_PROPERTY_ID,
  BOUNTY_BUDGET_PROPERTY_ID,
  BOUNTY_DESCRIPTION_PROPERTY_ID,
  BOUNTY_DIFFICULTY_PROPERTY_ID,
  BOUNTY_SKILLS_PROPERTY_ID,
  BOUNTY_TASK_STATUS_PROPERTY_ID,
  BOUNTY_TYPE_ID,
  FEATURED_TAG_ID,
  TAG_PROPERTY_ID,
} from '~/core/constants';
import { ID } from '~/core/id';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';

import type { BountyContributor, SpaceBountiesResult, SpaceBounty } from './bounty-types';
import { ID_CHUNK_SIZE, afterArg, chunk, collectConnection, gqlId, gqlIdList, runQuery } from './community-graphql';

const BOUNTY_PAGE_SIZE = 100;

type RelationTarget = { id: string; name: string | null; types: { id: string }[] | null };

type BountyNode = {
  id: string;
  name: string | null;
  valuesList: { propertyId: string; text: string | null; float: number | null; integer: string | null }[];
  relationsList: { typeId: string; toEntity: RelationTarget }[];
};

function isPerson(target: RelationTarget): boolean {
  return (target.types ?? []).some(type => ID.equals(type.id, SystemIds.PERSON_TYPE));
}

function numberFromValue(value: BountyNode['valuesList'][number] | undefined): number | null {
  if (!value) return null;
  if (typeof value.float === 'number' && Number.isFinite(value.float)) return value.float;
  if (value.integer != null && value.integer !== '') {
    const parsed = Number(value.integer);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value.text) {
    const parsed = Number(value.text.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function relationTargets(node: BountyNode, propertyId: string): RelationTarget[] {
  return node.relationsList
    .filter(relation => ID.equals(relation.typeId, propertyId))
    .map(relation => relation.toEntity);
}

async function fetchContributorAvatars(
  entityIds: string[],
  signal?: AbortController['signal']
): Promise<Map<string, string>> {
  const avatarByEntityId = new Map<string, string>();
  const avatarProperty = gqlId(AVATAR_PROPERTY_ID);
  const imageUrlProperty = gqlId(SystemIds.IMAGE_URL_PROPERTY);
  if (!avatarProperty || !imageUrlProperty || entityIds.length === 0) return avatarByEntityId;

  for (const ids of chunk(entityIds, ID_CHUNK_SIZE)) {
    const data = await runQuery<{
      entitiesConnection?: {
        nodes: {
          id: string;
          relationsList: { toEntity: { valuesList: { text: string | null }[] } }[];
        }[];
      };
    }>(
      'bounty contributor avatars',
      `query {
        entitiesConnection(first: ${ids.length}, filter: { id: { in: [${gqlIdList(ids)}] } }) {
          nodes {
            id
            relationsList(first: 5, filter: { typeId: { is: "${avatarProperty}" } }) {
              toEntity {
                valuesList(first: 5, filter: { propertyId: { is: "${imageUrlProperty}" } }) { text }
              }
            }
          }
        }
      }`,
      signal
    );

    for (const node of data?.entitiesConnection?.nodes ?? []) {
      const url = node.relationsList.flatMap(relation => relation.toEntity.valuesList).find(value => value.text)?.text;
      if (url) avatarByEntityId.set(node.id, url);
    }
  }

  return avatarByEntityId;
}

async function fetchAllocationProfiles(
  targetIds: string[]
): Promise<Map<string, { id: string; name: string; avatarUrl: string | null }>> {
  const byTargetId = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
  if (targetIds.length === 0) return byTargetId;

  const profiles = await Effect.runPromise(fetchProfilesBySpaceIds(targetIds));

  profiles.forEach((profile, index) => {
    const name = profile.name?.trim();
    if (!name) return;
    byTargetId.set(targetIds[index], { id: profile.id, name, avatarUrl: profile.avatarUrl });
  });

  return byTargetId;
}

export async function fetchSpaceBounties({
  spaceId,
  taskStatusId,
  signal,
}: {
  spaceId: string;
  taskStatusId: string;
  signal?: AbortController['signal'];
}): Promise<SpaceBountiesResult> {
  const empty: SpaceBountiesResult = { bounties: [], skills: [], truncated: false };

  const spaceHex = gqlId(spaceId);
  const bountyType = gqlId(BOUNTY_TYPE_ID);
  const taskStatusProperty = gqlId(BOUNTY_TASK_STATUS_PROPERTY_ID);
  const statusHex = gqlId(taskStatusId);
  if (!spaceHex || !bountyType || !taskStatusProperty || !statusHex) return empty;

  const {
    nodes,
    truncated: bountiesTruncated,
    totalCount,
  } = await collectConnection<BountyNode>(
    'space bounties',
    after => `query {
      entitiesConnection(
        first: ${BOUNTY_PAGE_SIZE}${afterArg(after)}
        spaceId: "${spaceHex}"
        typeId: "${bountyType}"
        filter: {
          relations: {
            some: { typeId: { is: "${taskStatusProperty}" }, toEntityId: { is: "${statusHex}" } }
          }
        }
      ) {
        totalCount
        pageInfo { endCursor hasNextPage }
        nodes {
          id
          name
          valuesList(first: 30) { propertyId text float integer }
          relationsList(first: 60) { typeId toEntity { id name types { id } } }
        }
      }
    }`,
    data => data.entitiesConnection,
    signal
  );

  if (nodes.length === 0) return { ...empty, truncated: bountiesTruncated, totalCount };

  const contributorIds = new Set<string>();
  for (const node of nodes) {
    for (const target of relationTargets(node, BOUNTY_ALLOCATED_PROPERTY_ID)) {
      if (target.id) contributorIds.add(target.id);
    }
  }

  const [avatarByEntityId, profileByTargetId] = await Promise.all([
    fetchContributorAvatars([...contributorIds], signal),
    fetchAllocationProfiles([...contributorIds]),
  ]);

  const resolveContributor = (target: RelationTarget): BountyContributor | null => {
    const profile = profileByTargetId.get(target.id);
    if (profile) {
      return { entityId: profile.id, name: profile.name, avatarUrl: profile.avatarUrl };
    }

    const name = target.name?.trim();
    if (!name || !isPerson(target)) return null;

    return { entityId: target.id, name, avatarUrl: avatarByEntityId.get(target.id) ?? null };
  };

  const bounties: SpaceBounty[] = nodes.map(node => {
    const budgetValue = node.valuesList.find(value => ID.equals(value.propertyId, BOUNTY_BUDGET_PROPERTY_ID));

    const seenContributors = new Set<string>();
    const contributors: BountyContributor[] = [];
    for (const target of relationTargets(node, BOUNTY_ALLOCATED_PROPERTY_ID)) {
      if (!target.id) continue;
      const contributor = resolveContributor(target);
      if (!contributor || seenContributors.has(contributor.entityId)) continue;
      seenContributors.add(contributor.entityId);
      contributors.push(contributor);
    }

    const skills = [
      ...new Set(
        relationTargets(node, BOUNTY_SKILLS_PROPERTY_ID)
          .map(target => target.name?.trim())
          .filter((name): name is string => Boolean(name))
      ),
    ];

    const descriptionValue = node.valuesList.find(value => ID.equals(value.propertyId, BOUNTY_DESCRIPTION_PROPERTY_ID));

    return {
      id: node.id,
      spaceId,
      name: node.name?.trim() || 'Untitled bounty',
      description: descriptionValue?.text?.trim() || null,
      budget: numberFromValue(budgetValue),
      difficulty: relationTargets(node, BOUNTY_DIFFICULTY_PROPERTY_ID)[0]?.name?.trim() ?? null,
      skills,
      isFeatured: relationTargets(node, TAG_PROPERTY_ID).some(target => ID.equals(target.id, FEATURED_TAG_ID)),
      contributors,
    } satisfies SpaceBounty;
  });

  const skills = [...new Set(bounties.flatMap(bounty => bounty.skills))].sort((a, b) => a.localeCompare(b));

  return { bounties, skills, truncated: bountiesTruncated, totalCount };
}
