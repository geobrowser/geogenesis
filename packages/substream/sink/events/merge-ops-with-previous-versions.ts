import { Effect } from 'effect';
import type * as Schema from 'zapatos/schema';

import { Triples, Versions } from '../db';
import type { Op } from '../types';
import type { SchemaTripleEdit } from './proposal-processed/map-triples';

interface MergeOpsWithPreviousVersionArgs {
  versions: Schema.versions.Insertable[];
  opsByVersionId: Map<string, Op[]>;
  edits: Schema.edits.Insertable[];
}

export function mergeOpsWithPreviousVersions(args: MergeOpsWithPreviousVersionArgs) {
  const spaceIdByEditId = new Map<string, string>();

  for (const edit of args.edits) {
    spaceIdByEditId.set(edit.id.toString(), edit.space_id.toString());
  }

  return Effect.gen(function* (_) {
    const { versions, opsByVersionId } = args;
    const newOpsByVersionId = new Map<string, Op[]>();

    for (const version of versions) {
      // @TODO(performance): We probably want to prefetch this instead of doing it blocking in the loop
      const lastVersion = yield* _(Effect.promise(() => Versions.findLatestValid(version.entity_id.toString())));

      if (lastVersion) {
        const lastVersionTriples = yield* _(Effect.promise(() => Triples.select({ version_id: lastVersion.id })));

        if (lastVersion.id === 'e74c548d5be3497c9ad06f6259a7e49c') {
          console.log('last version triples', lastVersionTriples);
        }

        const editWithCreatedById: SchemaTripleEdit = {
          versonId: version.id.toString(),
          createdById: version.created_by_id.toString(),
          spaceId: spaceIdByEditId.get(version.edit_id.toString())!,
          ops: opsByVersionId.get(version.id.toString())!,
        };

        if (lastVersionTriples.length > 0) {
          // Make sure that we put the last version's ops before the new version's
          // ops so that when we squash the ops later they're ordered correctly.
          newOpsByVersionId.set(version.id.toString(), [
            ...lastVersionTriples.map((t): Op => {
              return {
                type: 'SET_TRIPLE',
                triple: {
                  entity: t.entity_id,
                  attribute: t.attribute_id,
                  value: {
                    type: t.value_type,
                    value: (t.value_type === 'ENTITY' ? t.entity_value_id : t.text_value) as string,
                  },
                },
              };
            }),
            ...(editWithCreatedById.ops ?? []),
          ]);
        }
      }
    }

    return newOpsByVersionId;
  });
}
