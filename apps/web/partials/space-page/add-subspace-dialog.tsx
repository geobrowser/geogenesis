'use client';

import { useQuery } from '@urql/next';
import { motion } from 'framer-motion';
import { graphql } from 'gql.tada';
import Link from 'next/link';

import * as React from 'react';

import { getSpaceConfigFromMetadata } from '~/core/io/subgraph/network-local-mapping';

import { Avatar } from '~/design-system/avatar';
import { SmallButton } from '~/design-system/button';
import { Dialog } from '~/design-system/dialog';
import { Input } from '~/design-system/input';

import { useAddSubspace } from './use-add-subspace';

interface Props {
  spaceId: string;
  trigger: React.ReactNode;
}

// @TODO: In the future this should query for spaces as you type instead of filtering
// the entire list of spaces in the system
export function AddSubspaceDialog({ trigger, spaceId }: Props) {
  return (
    <Dialog
      trigger={trigger}
      content={<Content spaceId={spaceId} />}
      header={<h1 className="text-smallTitle">Subspaces</h1>}
    />
  );
}

interface ContentProps {
  spaceId: string;
}

// @TODO: How do we do fragments?
const SpacesQuery = graphql(`
  query Spaces($name: String!) {
    spaces(filter: { spacesMetadata: { some: { entity: { name: { includesInsensitive: $name } } } } }, first: 10) {
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
              id
              name
              types {
                nodes {
                  id
                  name
                }
              }
              triples {
                nodes {
                  attribute {
                    id
                    name
                  }
                  entityId
                  entity {
                    id
                    name
                  }
                  entityValue {
                    id
                    types {
                      nodes {
                        id
                      }
                    }
                    name
                    triples {
                      nodes {
                        attributeId
                        textValue
                        valueType
                      }
                    }
                  }
                  numberValue
                  collectionValue {
                    id
                    collectionItems {
                      nodes {
                        index
                        collectionItemEntityId
                        entity {
                          id
                          name
                          types {
                            nodes {
                              id
                            }
                          }
                          triples {
                            nodes {
                              attributeId
                              textValue
                              valueType
                            }
                          }
                        }
                      }
                    }
                  }
                  textValue
                  valueType
                  space {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);

function Content({ spaceId }: ContentProps) {
  const [query, setQuery] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const [res] = useQuery({
    query: SpacesQuery,
    variables: {
      name: query,
    },
  });

  // @TODO: A collection result should never be null and is just an empty array
  const spaces = res.data?.spaces?.nodes.map(s => {
    return {
      id: s!.id,
      daoAddress: s!.daoAddress,
      spaceConfig: getSpaceConfigFromMetadata(s!.id, s?.spacesMetadata.nodes?.[0]?.entity ?? undefined),
      totalMembers: s?.spaceMembers.totalCount ?? 0,
      totalEditors: s?.spaceEditors.totalCount ?? 0,
    };
  });

  // @TODO: Fix starting height of dialog
  // @TODO: Fix types for graphql query results
  // @TODO: fetch existing subspaces for the current space
  // @TODO: only query list of spaces from spaces that aren't already subspaces, aren't
  //        part of in-flight proposals, and aren't the current space.
  // @TODO: Render current subspaces
  // @TODO: Render in-flight subspaces
  // @TODO: Fragments

  const { proposeAddSubspace } = useAddSubspace({
    spaceId,
  });

  const onAddSubspace = (subspaceAddress: string) => {
    proposeAddSubspace(subspaceAddress);
  };

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-metadata text-grey-04">Find subspaces to add</h2>
      <div className="relative">
        <Input ref={inputRef} withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

        {query && spaces?.length !== 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{
              type: 'spring',
              duration: 0.15,
              bounce: 0,
            }}
            // Doing some fixed positioning to be able to break out the results list
            // from the height and flow of the dialog component
            className={`fixed top-[456px] z-20 w-[554px] origin-top divide-y divide-grey-02 overflow-hidden rounded-lg border border-grey-02 bg-white`}
          >
            {spaces?.map(s => (
              <Link
                href={s.id}
                key={s.id}
                className="flex w-full items-center justify-between px-3 py-2 transition-colors duration-150 hover:bg-divider"
              >
                <div className="flex flex-1 items-center gap-2">
                  <div className="relative h-8 w-8 overflow-hidden rounded">
                    <Avatar size={32} avatarUrl={s.spaceConfig?.image} value={s.id} />
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-metadataMedium">{s.spaceConfig?.name ?? s.id}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-footnoteMedium text-grey-03">{s.totalEditors}</p>
                      <p className="text-footnoteMedium text-grey-03">{s.totalMembers}</p>
                    </div>
                  </div>
                </div>
                <SmallButton onClick={() => onAddSubspace(s.daoAddress)}>Propose to add</SmallButton>
              </Link>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
