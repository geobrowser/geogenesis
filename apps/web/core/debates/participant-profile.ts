import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';

import { Environment } from '~/core/environment';
import { fetchProfileHistory } from '~/core/io/subgraph/fetch-profile-history';
import { graphql } from '~/core/io/subgraph/graphql';
import { AVATAR_PROPERTY } from '~/core/profile/history-ontology';
import { currentAffiliation } from '~/core/profile/profile-summary';
import { normId } from '~/core/utils/norm-id';
import { getSpaceRank } from '~/core/utils/space/space-ranking';

export interface ParticipantProfile {
  name: string | null;
  avatarUrl: string | null;
  byline: string | null;
}

interface IdentityResult {
  entity: {
    spaceIds: string[] | null;
    names: { spaceId: string; text: string | null }[];
    avatars: { spaceId: string; toEntity: { urls: { text: string | null }[] } | null }[];
  } | null;
}

async function read<T>(query: string): Promise<T> {
  return Effect.runPromise(graphql<T>({ query, endpoint: Environment.getConfig().api }));
}

async function bylineInSpace(entityId: string, spaceId: string): Promise<string | null> {
  const history = await fetchProfileHistory(entityId, spaceId);
  return history.tagline ?? currentAffiliation(history.employment, history.education) ?? history.description;
}

/**
 * Video overlays prefer each personal-space field, then public spaces in rank order.
 * Keep this separate from editable profile queries: a public assertion is a display fallback,
 * never a value the person authored in their own space. History stays scoped at every level.
 */
export async function fetchParticipantProfile(entityId: string, personalSpaceId: string): Promise<ParticipantProfile> {
  const [identity, byline] = await Promise.all([
    read<IdentityResult>(`{
      entity(id: ${JSON.stringify(entityId)}) {
        spaceIds
        names: valuesList(first: 1000, filter: { propertyId: { is: ${JSON.stringify(SystemIds.NAME_PROPERTY)} } }) {
          spaceId text
        }
        avatars: relationsList(first: 1000, filter: { typeId: { is: ${JSON.stringify(AVATAR_PROPERTY)} } }) {
          spaceId
          toEntity {
            urls: valuesList(first: 1, filter: { propertyId: { is: ${JSON.stringify(SystemIds.IMAGE_URL_PROPERTY)} } }) { text }
          }
        }
      }
    }`),
    bylineInSpace(entityId, personalSpaceId),
  ]);
  const entity = identity.entity;
  const nameInSpace = (spaceId: string) =>
    entity?.names.find(value => normId(value.spaceId) === spaceId && value.text?.trim())?.text?.trim() || null;
  const avatarInSpace = (spaceId: string) =>
    entity?.avatars
      .find(relation => normId(relation.spaceId) === spaceId && relation.toEntity?.urls[0]?.text?.trim())
      ?.toEntity?.urls[0]?.text?.trim() || null;
  const personalId = normId(personalSpaceId);
  const profile = { name: nameInSpace(personalId), avatarUrl: avatarInSpace(personalId), byline };
  if (profile.name && profile.avatarUrl && profile.byline) return profile;

  const otherSpaceIds = [...new Set((entity?.spaceIds ?? []).map(normId))].filter(id => id !== personalId);
  if (otherSpaceIds.length === 0) return profile;

  try {
    const { spaces } = await read<{ spaces: { id: string; type: string }[] }>(`{
      spaces(first: ${otherSpaceIds.length}, filter: { id: { in: ${JSON.stringify(otherSpaceIds)} } }) { id type }
    }`);
    const publicSpaceIds = spaces
      .filter(space => space.type === 'DAO')
      .map(space => normId(space.id))
      .sort((a, b) => getSpaceRank(a) - getSpaceRank(b) || a.localeCompare(b));

    // Select identity fields before fetching history so a failed history read cannot erase them.
    for (const spaceId of publicSpaceIds) {
      profile.name ??= nameInSpace(spaceId);
      profile.avatarUrl ??= avatarInSpace(spaceId);
    }
    for (const spaceId of publicSpaceIds) {
      if (profile.byline) break;
      profile.byline = await bylineInSpace(entityId, spaceId);
    }
  } catch (error) {
    // Optional enrichment must not hide the personal fields when a public read fails.
    console.error('[debate-participant-profile] Failed to resolve public fallback', error);
  }
  return profile;
}
