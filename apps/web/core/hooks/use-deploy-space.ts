import { Op, SYSTEM_IDS, createImageEntityOps } from '@geogenesis/sdk';
import { Duration, Effect, Either, Schedule } from 'effect';
import { getAddress } from 'viem';

import { Environment } from '~/core/environment';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { ID } from '../id';
import { graphql } from '../io/subgraph/graphql';
import { SpaceType } from '../types';
import { generateTriplesForCompany } from '../utils/contracts/generate-triples-for-company';
import { generateTriplesForNonprofit } from '../utils/contracts/generate-triples-for-nonprofit';
import { Ops } from '../utils/ops';
import { Triples } from '../utils/triples';
import { deploySpace } from '~/app/api/deploy';

interface DeployArgs {
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri: string;
}

export function useDeploySpace() {
  const smartAccount = useSmartAccount();

  const deploy = async (args: DeployArgs) => {
    if (!smartAccount) {
      return;
    }

    // @TODO: Effectify
    return await deploySpace({
      ...args,
      initialEditorAddress: smartAccount?.account.address,
    });
  };

  return {
    deploy,
  };
}

async function publishOpsForSpaceType({ type, spaceName, spaceAvatarUri }: DeployArgs) {
  const ops: Op[] = [];
  const newEntityId = ID.createEntityId();

  // Add triples for a Person entity
  if (type === 'default' || type === 'personal') {
    ops.push(
      Ops.create({
        entityId: newEntityId,
        attributeId: SYSTEM_IDS.NAME,
        value: {
          type: 'TEXT',
          value: spaceName,
        },
      })
    );

    ops.push(
      Ops.create({
        entityId: newEntityId,
        attributeId: SYSTEM_IDS.TYPES,
        value: {
          type: 'ENTITY',
          value: SYSTEM_IDS.SPACE_CONFIGURATION,
        },
      })
    );

    // @TODO: Do we add the Person type? That would mean this has to be a collection
  }

  if (type === 'company') {
    // Space address doesn't matter here since we're immediately writing the ops and not persisting
    // in the local db.
    const companyTriples = await generateTriplesForCompany(newEntityId, spaceName, 'bogus space');
    ops.push(...Triples.prepareTriplesForPublishing(companyTriples, 'bogus space'));
  }

  if (type === 'nonprofit') {
    const nonprofitTriples = await generateTriplesForNonprofit(newEntityId, spaceName, 'bogus space');
    ops.push(...Triples.prepareTriplesForPublishing(nonprofitTriples, 'bogus space'));
  }

  if (spaceAvatarUri) {
    const [typeOp, srcOp] = createImageEntityOps(spaceAvatarUri);

    // Creates the image entity
    ops.push(typeOp);
    ops.push(srcOp);

    // Creates the triple pointing to the image entity
    ops.push(
      Ops.create({
        entityId: newEntityId,
        attributeId: SYSTEM_IDS.AVATAR_ATTRIBUTE,
        value: {
          type: 'ENTITY',
          value: typeOp.payload.entityId,
        },
      })
    );
  }

  return ops;
}

function getGovernanceTypeForSpaceType(type: SpaceType): 'governance' | 'personal' {
  switch (type) {
    case 'default':
      return 'governance';
    case 'personal':
    case 'company':
    case 'nonprofit':
    default:
      return 'personal';
  }
}

const query = (daoAddress: string) => ` {
  spaces(filter: { daoAddress: { equalTo: "${getAddress(daoAddress)}" } }) {
    nodes {
      id
    }
  }
}`;

async function waitForSpaceToBeIndexed(daoAddress: string) {
  const endpoint = Environment.getConfig().api;

  const graphqlFetchEffect = graphql<{
    spaces: { nodes: { id: string }[] };
  }>({
    endpoint,
    query: query(daoAddress),
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
            `Encountered runtime graphql error in waitForSpaceToBeIndexed. endpoint: ${endpoint}

            queryString: ${query(daoAddress)}
            `,
            error.message
          );

          return null;

        default:
          console.error(`${error._tag}: Unable to wait for space to be indexed, endpoint: ${endpoint}`);

          return null;
      }
    }

    const maybeSpace = resultOrError.right.spaces.nodes[0];

    if (!maybeSpace) {
      yield* Effect.fail(new Error('Could not find deployed space'));
      return null;
    }

    return maybeSpace.id;
  });

  const retried = Effect.retry(
    graphqlFetchWithErrorFallbacks,
    Schedule.exponential(100).pipe(
      Schedule.jittered,
      Schedule.compose(Schedule.elapsed),
      // Retry for 30 seconds.
      Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(60)))
    )
  );

  return await Effect.runPromise(retried);
}
