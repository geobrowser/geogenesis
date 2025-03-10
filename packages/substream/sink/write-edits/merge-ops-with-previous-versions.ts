import { Effect } from 'effect';
import type * as Schema from 'zapatos/schema';

import { CurrentVersions, Triples } from '../db';
import type { DeleteTripleOp, SetTripleOp } from '../types';

interface MergeOpsWithPreviousVersionArgs {
  versions: Schema.versions.Insertable[];
  tripleOpsByVersionId: Map<string, (SetTripleOp | DeleteTripleOp)[]>;
  edits: Schema.edits.Insertable[];
}

export function mergeOpsWithPreviousVersions(args: MergeOpsWithPreviousVersionArgs) {
  const spaceIdByEditId = new Map<string, string>();
  const { versions, tripleOpsByVersionId } = args;

  for (const edit of args.edits) {
    spaceIdByEditId.set(edit.id.toString(), edit.space_id.toString());
  }

  return Effect.gen(function* (_) {
    const newOpsByVersionId = new Map<string, (SetTripleOp | DeleteTripleOp)[]>();

    const maybeLatestVersionForEntityIds = yield* _(
      Effect.forEach(
        versions,
        v =>
          Effect.promise(async () => {
            const latestVersion = await CurrentVersions.selectOne({ entity_id: v.entity_id.toString() });
            if (!latestVersion) return null;
            return [v.entity_id.toString(), latestVersion.version_id.toString()] as const;
          }),
        {
          concurrency: 50,
        }
      )
    );

    // entity id -> version id
    const lastVersionForEntityId = Object.fromEntries(maybeLatestVersionForEntityIds.filter(v => v !== null));
    const triplesForLastVersionTuples = yield* _(
      Effect.forEach(
        Object.values(lastVersionForEntityId),
        versionId =>
          Effect.promise(async () => {
            const lastVersionTriples = await Triples.select({ version_id: versionId });
            return [versionId, lastVersionTriples] as const;
          }),
        {
          concurrency: 50,
        }
      )
    );

    const triplesForLastVersion = Object.fromEntries(triplesForLastVersionTuples);

    for (const version of versions) {
      const opsForVersion = tripleOpsByVersionId.get(version.id.toString()) ?? [];
      const lastVersionId = lastVersionForEntityId[version.entity_id.toString()];

      if (lastVersionId) {
        const lastVersionTriples = triplesForLastVersion[lastVersionId] ?? [];

        // Make sure that we put the last version's ops before the new version's
        // ops so that when we squash the ops later they're ordered correctly.
        newOpsByVersionId.set(version.id.toString(), [
          ...lastVersionTriples.map((t): SetTripleOp => {
            return {
              type: 'SET_TRIPLE',
              space: t.space_id.toString(),
              triple: {
                entity: t.entity_id,
                attribute: t.attribute_id,
                value: {
                  type: t.value_type,
                  value: t.text_value as string,
                  options: {
                    format: t.format_option ?? undefined,
                    unit: t.unit_option ?? undefined,
                    language: t.language_option ?? undefined,
                  },
                },
              },
            };
          }),
          ...opsForVersion,
        ]);
      } else {
        newOpsByVersionId.set(version.id.toString(), opsForVersion);
      }
    }

    return newOpsByVersionId;
  });
}
