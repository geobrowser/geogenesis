import { Schema } from '@effect/schema';
import { Effect, Either } from 'effect';
import { dedupeWith } from 'effect/Array';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Environment } from '~/core/environment';
import { EntityDto } from '~/core/io/dto/entities';
import { SubstreamEntity, SubstreamVersion } from '~/core/io/schema';
import { fetchSpacesById } from '~/core/io/subgraph/fetch-spaces-by-id';
import { versionFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';
import { Entities } from '~/core/utils/entity';

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
    backlinks.flatMap(e => e.spaces),
    (a, z) => a === z
  );
  const spaces = await fetchSpacesById(referencedSpaces);

  const referencedByEntities: ReferencedByEntity[] = backlinks.map(e => {
    const spaceId = Entities.nameTriple(e.triples)?.space ?? '';

    const space = spaces.find(s => s.id === spaceId);
    const spaceName = space?.spaceConfig?.name ?? null;
    const spaceImage = space?.spaceConfig?.image ?? PLACEHOLDER_SPACE_IMAGE;

    return {
      id: e.id,
      name: e.name,
      types: e.types,
      space: {
        id: spaceId,
        name: spaceName,
        image: spaceImage,
      },
    };
  });

  return <EntityPageReferencedBy referencedByEntities={referencedByEntities} name={name} />;
}

const query = (entityId: string) => {
  return `{
    entities(filter: {
      currentVersion: {
        version: {
          relationsByFromVersionId: {
            some: {
              toVersion: { entityId: { equalTo: "${entityId}" } }
            }
          }
        }
      }
    }
  )  {
      nodes {
        id
        currentVersion {
          version {
          id
          entityId
          name
          description
          versionSpaces {
            nodes {
              spaceId
            }
          }
        }
      }
    }
  }`;
};

interface NetworkResult {
  entities: { nodes: SubstreamEntity[] };
}

const SubstreamBacklink = Schema.Struct({
  id: SubstreamEntity.pick('id'),
  currentVersion: Schema.Struct({
    id: SubstreamVersion.pick('id'),
    name: SubstreamVersion.pick('name'),
    versionSpaces: SubstreamVersion.pick('versionSpaces'),
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
        onRight: entity => {
          return EntityDto(entity);
        },
      });
    })
    .filter(e => e !== null);
}

function BacklinkDto(backlink: SubstreamBacklink) {
  return {
    id: backlink.id,
    name: backlink.currentVersion.name,
    space: {
      id: backlink.currentVersion.versionSpaces.nodes[0].spaceId,
      name: backlink.currentVersion.versionSpaces.nodes[0].space.name,
      image: backlink.currentVersion.versionSpaces.nodes[0].space.image,
    },
  };
}
