'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect, Either } from 'effect';
import { motion } from 'framer-motion';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import * as React from 'react';

import { Environment } from '~/core/environment';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { Subspace } from '~/core/io/subgraph/fetch-subspaces';
import { spaceMetadataFragment } from '~/core/io/subgraph/fragments';
import { graphql } from '~/core/io/subgraph/graphql';
import { getSpaceConfigFromMetadata } from '~/core/io/subgraph/network-local-mapping';
import { NetworkSpaceResult } from '~/core/io/subgraph/types';
import { SpaceGovernanceType } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';
import { Dialog } from '~/design-system/dialog';
import { Divider } from '~/design-system/divider';
import { MemberTiny } from '~/design-system/icons/member-tiny';
import { MemberTinyFilled } from '~/design-system/icons/member-tiny-filled';
import { Input } from '~/design-system/input';

import { useAddSubspace } from './use-add-subspace';
import { useRemoveSubspace } from './use-remove-subspace';

interface Props {
  spaceType: SpaceGovernanceType;
  subspaces: Subspace[];
  inflightSubspaces: Subspace[];
  spaceId: string;
  trigger: React.ReactNode;
}

export function AddSubspaceDialog({ trigger, spaceType, spaceId, subspaces, inflightSubspaces }: Props) {
  return (
    <Dialog
      trigger={trigger}
      content={
        <Content spaceType={spaceType} subspaces={subspaces} spaceId={spaceId} inflightSubspaces={inflightSubspaces} />
      }
      header={<h1 className="text-smallTitle">Subspaces</h1>}
    />
  );
}

interface ContentProps {
  spaceType: SpaceGovernanceType;
  subspaces: Subspace[];
  inflightSubspaces: Subspace[];
  spaceId: string;
}

const subspacesQuery = (name: string, notIn: string[]) => `
  {
    spaces(
      filter: { spacesMetadata: { some: { entity: { name: { includesInsensitive: "${name}" } } } }, id: { notIn: ${JSON.stringify(
        notIn
      )} } }
      first: 10
    ) {
      nodes {
        id
        daoAddress
        spaceMembers {
          totalCount
        }
        spaceEditors {
          totalCount
        }
        spacesMetadata {
          nodes {
            entity {
              ${spaceMetadataFragment}
            }
          }
        }
      }
    }
  }
`;

interface NetworkResult {
  spaces: {
    nodes: (Pick<NetworkSpaceResult, 'spacesMetadata' | 'id' | 'daoAddress'> & {
      spaceMembers: { totalCount: number };
      spaceEditors: { totalCount: number };
    })[];
  };
}

function useSubspacesQuery({
  subspaceIds,
  spaceId,
  inflightSubspaceIds,
}: {
  subspaceIds: string[];
  inflightSubspaceIds: string[];
  spaceId: string;
}) {
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebouncedValue(query, 200);

  const { data } = useQuery({
    queryKey: ['subspaces-by-name', debouncedQuery],
    queryFn: async ({ signal }) => {
      const queryEffect = graphql<NetworkResult>({
        query: subspacesQuery(query, [...subspaceIds, ...inflightSubspaceIds, spaceId]),
        endpoint: Environment.getConfig().api,
        signal,
      });

      const resultOrError = await Effect.runPromise(Effect.either(queryEffect));

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
              `Encountered runtime graphql error in subspaces-by-name. 
  
              queryString: ${subspacesQuery(query, [...subspaceIds, ...inflightSubspaceIds, spaceId])}
              `,
              error.message
            );

            return {
              spaces: {
                nodes: [],
              },
            };

          default:
            console.error(`${error._tag}: Unable to fetch spaces in subspaces-by-name`);

            return {
              spaces: {
                nodes: [],
              },
            };
        }
      }

      return resultOrError.right;
    },
  });

  if (!data) {
    return {
      query,
      setQuery,
      spaces: [],
    };
  }

  const spaces = data?.spaces?.nodes.map(s => {
    return {
      id: s.id,
      daoAddress: s.daoAddress,
      spaceConfig: getSpaceConfigFromMetadata(s.id, s.spacesMetadata.nodes[0].entity),
      totalMembers: s?.spaceMembers.totalCount ?? 0,
      totalEditors: s?.spaceEditors.totalCount ?? 0,
    };
  });

  return {
    query,
    setQuery,
    spaces,
  };
}

function Content({ spaceId, subspaces, inflightSubspaces, spaceType }: ContentProps) {
  const {
    query,
    setQuery,
    spaces: queriedSpaces,
  } = useSubspacesQuery({
    spaceId,
    subspaceIds: subspaces.map(s => s.id),
    inflightSubspaceIds: inflightSubspaces.map(s => s.id),
  });

  return (
    <div className="flex w-[460px] flex-col gap-4">
      <div className="space-y-2">
        <h2 className="text-metadata text-grey-04">Find subspaces to add</h2>

        <div className="relative">
          <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

          {query && queriedSpaces?.length !== 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{
                type: 'spring',
                duration: 0.1,
                bounce: 0,
              }}
              // Doing some fixed positioning to be able to break out the results list
              // from the height and flow of the dialog component
              className="fixed z-[102] mt-1 max-h-[243px] w-[460px] divide-y divide-grey-02 overflow-hidden overflow-y-auto rounded-lg border border-grey-02 bg-white"
            >
              {queriedSpaces?.map(s => <SpaceQueryResult subspace={s} spaceId={spaceId} />)}
            </motion.div>
          )}
        </div>
      </div>

      {inflightSubspaces.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-metadata text-grey-04">In-flight subspaces</h2>

          <Divider type="horizontal" />

          {inflightSubspaces?.map(s => (
            <Link
              href={s.id}
              key={s.id}
              className="flex w-full items-center justify-between py-2 transition-colors duration-150 hover:bg-divider"
            >
              <div className="flex flex-1 items-center gap-2">
                <div className="relative h-8 w-8 overflow-hidden rounded">
                  <Avatar size={32} avatarUrl={s.spaceConfig?.image} value={s.id} />
                </div>

                <div className="space-y-0.5">
                  <p className="text-metadataMedium">{s.spaceConfig?.name ?? s.id}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <MemberTinyFilled color="grey-03" />
                      <p className="text-footnoteMedium text-grey-03">{s.totalEditors}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <MemberTiny color="grey-03" />
                      <p className="text-footnoteMedium text-grey-03">{s.totalMembers}</p>
                    </div>
                  </div>
                </div>
              </div>
              {spaceType === 'PUBLIC' && (
                <Link href={`${NavUtils.toSpace(spaceId)}/governance`}>
                  <SmallButton>View proposal</SmallButton>
                </Link>
              )}
            </Link>
          ))}
        </div>
      )}

      {subspaces.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-metadata text-grey-04">Current subspaces</h2>

          <Divider type="horizontal" />

          {subspaces?.map(s => <CurrentSubspace subspace={s} spaceId={spaceId} spaceType={spaceType} />)}
        </div>
      )}
    </div>
  );
}

function SpaceQueryResult({ subspace, spaceId }: { subspace: Subspace; spaceId: string }) {
  const router = useRouter();
  const { addSubspace, isPending, isSuccess } = useAddSubspace({
    spaceId,
  });

  if (isSuccess) {
    // @TODO: Might make more sense to call a server action somewhere to revalidate the page?
    // The main problem is that the transaction has to occur on the client side, so adding
    // piping to call the server after the client-side transaction finishes is kinda wonky vs
    // just calling router.refresh() directly. Using a server action with revalidateTag will
    // let us more granularly revalidate the page though which might result in less data transfer.
    router.refresh();
    // Remove the item from the list once we succeed
    return null;
  }

  const onAddSubspace = (event: React.MouseEvent<HTMLButtonElement>, subspaceAddress: string) => {
    event.preventDefault(); // Don't bubble the event to the Link wrapping the button
    addSubspace(subspaceAddress);
  };

  return (
    <Link
      href={subspace.id}
      key={subspace.id}
      className="flex w-full items-center justify-between px-3 py-2 transition-colors duration-150 hover:bg-divider"
    >
      <div className="flex flex-1 items-center gap-2">
        <div className="relative h-8 w-8 overflow-hidden rounded">
          <Avatar size={32} avatarUrl={subspace.spaceConfig?.image} value={subspace.id} />
        </div>

        <div className="space-y-0.5">
          <p className="text-metadataMedium">{subspace.spaceConfig?.name ?? subspace.id}</p>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <MemberTinyFilled color="grey-03" />
              <p className="text-footnoteMedium text-grey-03">{subspace.totalEditors}</p>
            </div>
            <div className="flex items-center gap-1">
              <MemberTiny color="grey-03" />
              <p className="text-footnoteMedium text-grey-03">{subspace.totalMembers}</p>
            </div>
          </div>
        </div>
      </div>
      {/* @TODO: Actual states with animations */}
      {isPending && <SmallButton disabled>Pending</SmallButton>}
      {!isPending && !isSuccess && (
        <SmallButton onClick={event => onAddSubspace(event, subspace.daoAddress)}>Propose to add</SmallButton>
      )}
    </Link>
  );
}

function CurrentSubspace({
  subspace,
  spaceId,
  spaceType,
}: {
  subspace: Subspace;
  spaceId: string;
  spaceType: SpaceGovernanceType;
}) {
  const router = useRouter();
  const { removeSubspace, isPending, isSuccess } = useRemoveSubspace({
    spaceId,
  });

  if (isSuccess) {
    // @TODO: Might make more sense to call a server action somewhere to revalidate the page?
    // The main problem is that the transaction has to occur on the client side, so adding
    // piping to call the server after the client-side transaction finishes is kinda wonky vs
    // just calling router.refresh() directly. Using a server action with revalidateTag will
    // let us more granularly revalidate the page though which might result in less data transfer.
    router.refresh();
    // Remove the item from the list once we succeed
    return null;
  }

  const onRemoveSubspace = (event: React.MouseEvent<HTMLButtonElement>, subspaceAddress: string) => {
    event.preventDefault(); // Don't bubble the event to the Link wrapping the button
    removeSubspace(subspaceAddress);
  };

  return (
    <Link
      href={subspace.id}
      key={subspace.id}
      className="flex w-full items-center justify-between py-2 transition-colors duration-150 hover:bg-divider"
    >
      <div className="flex flex-1 items-center gap-2">
        <div className="relative h-8 w-8 overflow-hidden rounded">
          <Avatar size={32} avatarUrl={subspace.spaceConfig?.image} value={subspace.id} />
        </div>

        <div className="space-y-0.5">
          <p className="text-metadataMedium">{subspace.spaceConfig?.name ?? subspace.id}</p>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <MemberTinyFilled color="grey-03" />
              <p className="text-footnoteMedium text-grey-03">{subspace.totalEditors}</p>
            </div>
            <div className="flex items-center gap-1">
              <MemberTiny color="grey-03" />
              <p className="text-footnoteMedium text-grey-03">{subspace.totalMembers}</p>
            </div>
          </div>
        </div>
      </div>
      {/* @TODO: Actual states with animations */}
      {isPending && <SmallButton disabled>Pending</SmallButton>}
      {!isPending && !isSuccess && (
        <SmallButton onClick={event => onRemoveSubspace(event, subspace.daoAddress)}>
          {spaceType === 'PUBLIC' ? 'Propose to remove' : 'Remove subspace'}
        </SmallButton>
      )}
    </Link>
  );
}
