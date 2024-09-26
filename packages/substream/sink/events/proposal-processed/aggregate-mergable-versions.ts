import { createGeoId } from '@geobrowser/gdk';
import type * as S from 'zapatos/schema';

import type { BlockEvent, Op } from '~/sink/types';
import { createVersionId } from '~/sink/utils/id';

interface AggregateMergableVersionsArgs {
  manyVersionsByEntityId: Map<string, S.versions.Insertable[]>;
  opsByVersionId: Map<string, Op[]>;
  block: BlockEvent;
}

export function aggregateMergableOps(args: AggregateMergableVersionsArgs) {
  const { manyVersionsByEntityId, opsByVersionId, block } = args;
  const newOpsByVersionId = new Map<string, Op[]>();

  const newVersions = [...manyVersionsByEntityId.entries()].map(
    ([entityId, versionsByEntityId]): S.versions.Insertable => {
      const newVersionId = createVersionId({
        entityId,
        proposalId: createGeoId(), // This won't be deterministic
      });

      for (const version of versionsByEntityId) {
        const opsForVersion = opsByVersionId.get(version.id.toString());

        if (opsForVersion) {
          const previousOpsForNewVersion = newOpsByVersionId.get(newVersionId);

          if (previousOpsForNewVersion) {
            // Make sure that we put the last version's ops before the new version's
            // ops so that when we squash the ops later they're ordered correctly.
            newOpsByVersionId.set(newVersionId, [...previousOpsForNewVersion, ...opsForVersion]);
          } else {
            newOpsByVersionId.set(newVersionId, opsForVersion);
          }
        }
      }

      const firstVersion = versionsByEntityId[0]!;

      return {
        id: newVersionId,
        // For now we use the first version's data as the data for the new version
        // to keep things simple. This obviously isn't completely non-destructive.
        // Ideally we can reference the versions and edits that we use to derive
        // this new version.
        //
        // The obvious approach is to make versions -> edit mapping a many-to-many
        // relationship, but we're intentionally avoiding the complexity for now to
        // hit launch date.
        //
        // This approach might also make querying for the edit more complex in the
        // most common scenario where there's only one edit per version.
        created_at: Number(firstVersion.created_at),
        created_at_block: block.blockNumber,
        created_by_id: firstVersion.created_by_id,
        edit_id: firstVersion.edit_id,
        entity_id: firstVersion.entity_id,
      };
    }
  );

  return {
    mergedVersions: newVersions,
    mergedOpsByVersionId: newOpsByVersionId,
  };
}

type EntityId = string;

export function aggregateMergableVersions(versions: S.versions.Insertable[]): Map<EntityId, S.versions.Insertable[]> {
  const seenEntities = new Set<EntityId>();
  const entitiesWithManyVersions = new Set<EntityId>();

  for (const version of versions) {
    if (seenEntities.has(version.entity_id.toString()) && !entitiesWithManyVersions.has(version.entity_id.toString())) {
      entitiesWithManyVersions.add(version.entity_id.toString());
    } else {
      seenEntities.add(version.entity_id.toString());
    }
  }

  const manyVersionsByEntityId = new Map<EntityId, S.versions.Insertable[]>();

  for (const version of versions) {
    if (entitiesWithManyVersions.has(version.entity_id.toString())) {
      const versionsForEntity = manyVersionsByEntityId.get(version.entity_id.toString()) ?? [];
      versionsForEntity.push(version);
      manyVersionsByEntityId.set(version.entity_id.toString(), versionsForEntity);
    }
  }

  return manyVersionsByEntityId;
}
