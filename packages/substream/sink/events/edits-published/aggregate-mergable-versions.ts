import type * as S from 'zapatos/schema';

import type { BlockEvent, Op } from '~/sink/types';
import { createMergedVersionId } from '~/sink/utils/id';

interface AggregateMergableVersionsArgs {
  manyVersionsByEntityId: Map<string, S.versions.Insertable[]>;
  opsByVersionId: Map<string, Op[]>;
  block: BlockEvent;
}

export function aggregateMergableOps(args: AggregateMergableVersionsArgs) {
  const { manyVersionsByEntityId, opsByVersionId, block } = args;
  const newOpsByVersionId = new Map<string, Op[]>();

  const newVersions = [...manyVersionsByEntityId.values()].map((versionsByEntityId): S.versions.Insertable => {
    const newVersionId = createMergedVersionId(versionsByEntityId.map(v => v.id.toString()));

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
  });

  return {
    mergedVersions: newVersions,
    mergedOpsByVersionId: newOpsByVersionId,
  };
}

type EntityId = string;

export function aggregateMergableVersions(versions: S.versions.Insertable[]): Map<EntityId, S.versions.Insertable[]> {
  const manyVersionsByEntityId = new Map<EntityId, S.versions.Insertable[]>();

  for (const version of versions) {
    const entityId = version.entity_id.toString();
    const versionsForEntity = manyVersionsByEntityId.get(entityId);

    if (!versionsForEntity) {
      manyVersionsByEntityId.set(entityId, [version]);
    } else {
      manyVersionsByEntityId.set(entityId, [...versionsForEntity, version]);
    }
  }

  return manyVersionsByEntityId;
}
