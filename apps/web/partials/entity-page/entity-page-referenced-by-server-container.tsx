import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { dedupeWith } from 'effect/Array';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { SubstreamVersionTypes } from '~/core/io/schema';
import { fetchSpacesById } from '~/core/io/subgraph/fetch-spaces-by-id';
import { versionTypesFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';

import { EntityPageReferencedBy } from './entity-page-referenced-by';
import { ReferencedByEntity } from './types';

interface Props {
  entityId: string;
  name: string | null;
  spaceId: string;
}

export async function EntityReferencedByServerContainer({ entityId, name }: Props) {
  const backlinks = await fetchBacklinks(entityId);

  const referencedSpaces = dedupeWith(
    backlinks.flatMap(e => e.currentVersion.version.versionSpaces.nodes),
    (a, z) => a.spaceId === z.spaceId
  );
  const spaces = await fetchSpacesById(referencedSpaces.map(s => s.spaceId));

  const referencedByEntities: ReferencedByEntity[] = backlinks
    .map(e => {
      const firstSpaceId = e.currentVersion.version.versionSpaces.nodes[0]?.spaceId;

      if (!firstSpaceId) {
        return null;
      }

      const space = spaces.find(s => s.id === firstSpaceId);
      const spaceName = space?.entity?.name ?? null;
      const spaceImage = space?.entity?.image ?? PLACEHOLDER_SPACE_IMAGE;

      return {
        id: e.id,
        name: e.currentVersion.version.name,
        types: e.currentVersion.version.versionTypes.nodes.map(t => {
          return {
            id: t.type.entityId,
            name: t.type.name,
          };
        }),
        space: {
          id: firstSpaceId,
          name: spaceName,
          image: spaceImage,
        },
      } satisfies ReferencedByEntity;
    })
    .filter(e => e !== null);

  return <EntityPageReferencedBy referencedByEntities={referencedByEntities} name={name} />;
}

const query = (entityId: string) => {
  return `{
    entities(first: 100 filter: {
      currentVersion: {
        version: {
          relationsByFromVersionId: {
            some: {
              toEntity: { id: { equalTo: "${entityId}" } }
            }
          }
          name: {
            isNull: false
          }
        }
      }
    }
    orderBy: UPDATED_AT_BLOCK_DESC
  )  {
      nodes {
        id
        currentVersion {
          version {
            id
            entityId
            name
            description
            ${versionTypesFragment}
            versionSpaces {
              nodes {
                spaceId
              }
            }
          }
        }
      }
    }
  }`;
};

interface NetworkResult {
  entities: { nodes: SubstreamBacklink[] };
}

const SubstreamBacklink = Schema.Struct({
  id: Schema.String,
  currentVersion: Schema.Struct({
    version: Schema.Struct({
      id: Schema.String,
      name: Schema.NullOr(Schema.String),
      versionTypes: SubstreamVersionTypes,
      versionSpaces: Schema.Struct({
        nodes: Schema.Array(
          Schema.Struct({
            spaceId: Schema.String,
          })
        ),
      }),
    }),
  }),
});

type SubstreamBacklink = Schema.Schema.Type<typeof SubstreamBacklink>;

async function fetchBacklinks(entityId: string) {
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<NetworkResult>({
    endpoint,
    query: query(entityId),
  });

  const graphqlFetchWithErrorFallbacks = Effect.gen(function* () {
    const resultOrError = yield* Effect.either(graphqlFetchEffect);

    if (Either.isLeft(resultOrError)) {
      const error = resultOrError.left;

      switch (error._tag) {
        case 'AbortError':
          // Right now we re-throw AbortErrors and let the callers handle it. Eventually we want
          // the caller to consume the error channel as an effect. We throw here the typical JS
          // way so we don't infect more of the codebase with the effect runtime.
          throw error;
        case 'GraphqlRuntimeError':
          console.error(
            `Encountered runtime graphql error in fetchEntities. queryString: ${query(entityId)}
          `,
            error.message
          );

          return {
            entities: { nodes: [] },
          };

        default:
          console.error(`${error._tag}: Unable to fetch entities backlinks`);
          return {
            entities: { nodes: [] },
          };
      }
    }

    return resultOrError.right;
  });

  const unknownEntities = await Effect.runPromise(graphqlFetchWithErrorFallbacks);

  return unknownEntities.entities.nodes
    .map(e => {
      const decodedSpace = Schema.decodeEither(SubstreamBacklink)(e);

      return Either.match(decodedSpace, {
        onLeft: error => {
          console.error(`Unable to decode entity ${e.id} with error ${error}`);
          return null;
        },
        onRight: backlink => {
          return backlink;
        },
      });
    })
    .filter(e => e !== null);
}
