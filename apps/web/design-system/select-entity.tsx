import { SYSTEM_IDS } from '@geogenesis/sdk';
import { useAtom } from 'jotai';
import pluralize from 'pluralize';

import { useState } from 'react';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useSearch } from '~/core/hooks/use-search';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import type { Result } from '~/core/io/subgraph/fetch-results';
import type { RelationValueType } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';

import { EntityCreatedToast } from '~/design-system/autocomplete/entity-created-toast';
import { Tag } from '~/design-system/tag';
import { Toggle } from '~/design-system/toggle';

import { ArrowLeft } from './icons/arrow-left';
import { showingIdsAtom } from '~/atoms';

type SelectEntityProps = {
  onDone: (result: { id: string; name: string | null; space?: string }) => void;
  spaceId: string;
  allowedTypes?: RelationValueType[];
  placeholder?: string;
  className?: string;
};

export const SelectEntity = ({
  onDone,
  spaceId,
  allowedTypes,
  placeholder = 'Find or create...',
  className = '',
}: SelectEntityProps) => {
  const [isShowingIds, setIsShowingIds] = useAtom(showingIdsAtom);

  const [result, setResult] = useState<Result | null>(null);

  const { query, onQueryChange, isLoading, isEmpty, results } = useSearch({
    allowedTypes: allowedTypes?.map(type => type.typeId),
  });

  const handleShowIds = () => {
    setIsShowingIds(!isShowingIds);
  };

  const [, setToast] = useToast();
  const { upsert } = useActionsStore();

  const onCreateNewEntity = () => {
    const newEntityId = ID.createEntityId();

    // Create new entity with name and types
    upsert(
      {
        type: 'SET_TRIPLE',
        entityId: newEntityId,
        attributeId: SYSTEM_IDS.NAME,
        entityName: query,
        attributeName: 'Name',
        value: {
          type: 'TEXT',
          value: query,
        },
      },
      spaceId
    );

    if (allowedTypes) {
      allowedTypes.forEach(type => {
        upsert(
          {
            type: 'SET_TRIPLE',
            entityId: newEntityId,
            attributeId: SYSTEM_IDS.TYPES,
            entityName: query,
            attributeName: 'Types',
            value: {
              type: 'ENTITY',
              value: type.typeId,
              name: type.typeName,
            },
          },
          spaceId
        );
      });
    }

    onDone({ id: newEntityId, name: query });
    setToast(<EntityCreatedToast entityId={newEntityId} spaceId={spaceId} />);
  };

  return (
    <>
      <input
        type="text"
        value={query}
        onChange={({ currentTarget: { value } }) => onQueryChange(value)}
        placeholder={placeholder}
        className={className}
      />

      {query && (
        <div className="absolute z-[1000]">
          <div className="w-[400px] overflow-hidden rounded-md border border-divider bg-white">
            {!result ? (
              <div className="flex max-h-[180px] flex-col overflow-y-auto">
                {!results?.length && isLoading && (
                  <div className="block w-full border-b border-divider px-3 py-2">
                    <div className="truncate text-button text-text">Loading...</div>
                  </div>
                )}
                {isEmpty ? (
                  <div className="block w-full border-b border-divider px-3 py-2">
                    <div className="truncate text-button text-text">No results.</div>
                  </div>
                ) : (
                  <>
                    {results.map((result, index) => (
                      <button
                        key={index}
                        onClick={() => setResult(result)}
                        className="block w-full border-b border-divider px-3 py-2 hover:bg-grey-01"
                      >
                        <div className="truncate text-button text-text">{result.name}</div>
                        {isShowingIds && <div className="mb-2 mt-1 text-footnoteMedium text-grey-04">{result.id}</div>}
                        <div className="mt-1 flex items-center gap-1">
                          <div className="inline-flex gap-0">
                            {(result.spaces ?? []).slice(0, 3).map(space => (
                              <div
                                key={space.spaceId}
                                className="-ml-[4px] h-[14px] w-[14px] overflow-clip rounded-sm border border-white first:ml-0"
                              >
                                <img
                                  src={getImagePath(space.image)}
                                  alt=""
                                  className="block h-full w-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                          <div className="text-[0.75rem] font-medium text-grey-04">
                            {(result.spaces ?? []).length} {pluralize('space', (result.spaces ?? []).length)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-evenly border-b border-divider">
                  <div className="flex-1">
                    <button onClick={() => setResult(null)} className="p-2">
                      <ArrowLeft color="grey-04" />
                    </button>
                  </div>
                  <div className="flex flex-1 justify-center">
                    <span className="p-2 text-center text-smallButton text-grey-04">Select space version</span>
                  </div>
                  <div className="flex flex-1 justify-end">
                    {/* @TODO add settings */}
                    {/* <button className="p-2 text-smallButton text-grey-04">Settings</button> */}
                  </div>
                </div>
                <div className="flex max-h-[180px] flex-col overflow-y-auto">
                  {/* @TODO create triple */}
                  <button
                    onClick={() => {
                      onDone({
                        id: result.id,
                        name: result.name,
                      });
                    }}
                    className="flex min-h-[60px] w-full items-center justify-between border-b border-divider px-3 py-2 hover:bg-grey-01"
                  >
                    <div>
                      <div className="truncate text-button text-text">Any space</div>
                      <div className="mt-0.5 text-footnote text-grey-04">
                        Geo will select a space based on its own ranking
                      </div>
                    </div>
                    <div className="flex items-center">
                      {/* @TODO add spaces */}
                      {(result.spaces ?? []).slice(0, 3).map(space => (
                        <div
                          key={space.spaceId}
                          className="-ml-[4px] h-[14px] w-[14px] overflow-clip rounded-sm border border-white first:ml-0"
                        >
                          <img src={getImagePath(space.image)} alt="" className="block h-full w-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </button>
                  {(result.spaces ?? []).map((space, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        onDone({
                          id: result.id,
                          name: result.name,
                          space: space.spaceId,
                        });
                      }}
                      className="flex w-full items-center justify-between border-b border-divider px-3 py-2 hover:bg-grey-01"
                    >
                      <div>
                        <div className="truncate text-button text-text">{space.name}</div>
                        <div>
                          {/* @TODO add space type */}
                          <Tag>Space</Tag>
                        </div>
                      </div>
                      <div>
                        <div className="h-[32px] w-[32px] overflow-clip rounded-md">
                          <img src={getImagePath(space.image)} alt="" className="block h-full w-full object-cover" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
            {!result && (
              <div className="flex w-full items-center justify-between px-3 py-1.5">
                <button onClick={handleShowIds} className="inline-flex items-center gap-1.5">
                  <Toggle checked={isShowingIds} />
                  <div className="text-footnoteMedium text-grey-04">Show IDs</div>
                </button>
                <button onClick={onCreateNewEntity} className="text-smallButton text-grey-04">
                  Create new
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
