import { SYSTEM_IDS } from '@geogenesis/ids';
import { batch } from '@legendapp/state';
import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/legacy/image';

import * as React from 'react';

import { useWalletClient } from 'wagmi';

import { useActionsStore } from '~/core/hooks/use-actions-store';
import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { useSpaces } from '~/core/hooks/use-spaces';
import { MigrateAction, useMigrateHub } from '~/core/migrate/migrate';
import { Services } from '~/core/services';
import { useMergeEntity } from '~/core/state/merge-entity-store';
import { Triple as TripleType } from '~/core/types';
import { Triple } from '~/core/utils/triple';
import { getImagePath, partition } from '~/core/utils/utils';

import { Button, SquareButton } from '~/design-system/button';
import { CheckCircleReview } from '~/design-system/icons/check-circle-review';
import { Close } from '~/design-system/icons/close';
import { LeftArrowLong } from '~/design-system/icons/left-arrow-long';
import { SlideUp } from '~/design-system/slide-up';
import { Text } from '~/design-system/text';

import { MergeEntityPreviewPage } from './merge-entity-preview-page';
import { MergeEntityReviewPage } from './merge-entity-review-page';

type SelectedEntityKeysType = {
  [attributeId: string]: TripleType | TripleType[];
};

export function MergeEntityReview() {
  const { isMergeReviewOpen, setIsMergeReviewOpen } = useMergeEntity();
  const migrateHub = useMigrateHub();

  return (
    <SlideUp isOpen={isMergeReviewOpen} setIsOpen={setIsMergeReviewOpen}>
      <MergeEntityReviewChanges migrateHub={migrateHub} />
    </SlideUp>
  );
}

type MigrateHubType = {
  dispatch: (action: MigrateAction) => Promise<void>;
};

function MergeEntityReviewChanges({ migrateHub }: { migrateHub: MigrateHubType }) {
  const { setIsMergeReviewOpen, entityIdOne, entityIdTwo } = useMergeEntity();

  const { subgraph, config } = Services.useServices();
  function useEntityById(entityId: string) {
    const { data: entityTwoData } = useQuery({
      queryKey: ['entity-merge-review', entityIdTwo],
      queryFn: async () => {
        if (!entityId) return null;
        return await subgraph.fetchEntity({ endpoint: config.subgraph, id: entityId });
      },
    });
    return entityTwoData?.triples ?? [];
  }

  const { triples: entityOneTriples } = useEntityPageStore(); // triples from entity page
  const { create, remove } = useActionsStore();

  //  triples from subgraph for second entity -  @TODO merge with local data since there could be changes
  const entityTwoTriples = useEntityById(entityIdTwo);

  const entityOneNameTriple = entityOneTriples.find(triple => triple.attributeId === 'name');

  const { spaces } = useSpaces();
  const spaceEntityOne = spaces.find(space => space.id === entityOneTriples[0]?.space);
  const spaceEntityTwo = spaces.find(space => space.id === entityTwoTriples[0]?.space);
  const [mergedEntityId, setMergedEntityId] = React.useState<string>(entityIdOne); // set the entityOneId as the default 'id' for the merged entity
  const [selectedEntityKeys, setSelectedEntityKeys] = React.useState<SelectedEntityKeysType>({
    ...(entityOneNameTriple ? { [entityOneNameTriple.attributeId]: entityOneNameTriple } : {}),
  }); // set the entityOneNameTriple as the default for the 'name' triple
  const [mergeEntityStep, setMergeEntityStep] = React.useState<'mergeReview' | 'mergePublish'>('mergeReview');
  const { data: wallet } = useWalletClient();

  const mergedEntityTriples = Object.values(selectedEntityKeys ?? {}).flat();

  const allTriplesFromEntities = [...entityOneTriples, ...entityTwoTriples];

  const [unmergedTriples, mergedTriples] = partition(allTriplesFromEntities, t => !mergedEntityTriples.includes(t));

  const handlePublish = React.useCallback(async () => {
    if (!wallet || !mergedEntityId) return;

    try {
      const notMergedEntityId = mergedEntityId === entityIdOne ? entityIdTwo : entityIdOne;
      const mergedEntitySpaceId = mergedEntityId === entityIdOne ? spaceEntityOne?.id : spaceEntityTwo?.id;

      if (!mergedEntitySpaceId) throw new Error('SpaceID not found for merging entities.');
      batch(() => {
        unmergedTriples.forEach(t => remove(t)); // delete the triples that aren't merged
        mergedTriples.forEach(t => {
          create(
            Triple.withId({
              ...t,
              entityId: mergedEntityId,
              space: mergedEntitySpaceId,
            })
          );
        }); // create the triples that are merged
      });

      await migrateHub.dispatch({
        type: 'DELETE_ENTITY',
        payload: {
          entityId: notMergedEntityId,
        },
      }); // migrate the data with the non-selected entity id

      setIsMergeReviewOpen(false);
    } catch (err) {
      console.error('An error occurred while merging entities', err);
    }
  }, [
    wallet,
    mergedEntityId,
    entityIdOne,
    entityIdTwo,
    spaceEntityOne?.id,
    spaceEntityTwo?.id,
    migrateHub,
    setIsMergeReviewOpen,
    unmergedTriples,
    mergedTriples,
    remove,
    create,
  ]);

  function handleCheckboxSelect({
    attributeId,
    selectedTriples,
  }: {
    attributeId: string;
    selectedTriples: TripleType[];
  }) {
    const newSelectedKeys = { ...selectedEntityKeys };

    // check if current selection exists / any incoming triples are already selected
    const isAnyTripleSelected = selectedTriples?.some(triple => {
      const selected = newSelectedKeys[attributeId];
      if (Array.isArray(selected)) {
        return selected.some(selTriple => selTriple.entityId === triple.entityId);
      } else {
        return selected && selected.entityId === triple.entityId;
      }
    });
    if (isAnyTripleSelected) {
      delete newSelectedKeys[attributeId];
    } else {
      newSelectedKeys[attributeId] = selectedTriples;
    }

    setSelectedEntityKeys(newSelectedKeys);
  }

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white px-4 py-1 shadow-big md:px-4 md:py-3">
        <div className="inline-flex items-center gap-4">
          <SquareButton onClick={() => setIsMergeReviewOpen(false)} icon={<Close />} />
          <Text variant="metadataMedium">Merge entities</Text>
        </div>
        <div>
          {mergeEntityStep === 'mergeReview' ? (
            <Button onClick={() => setMergeEntityStep('mergePublish')}>Review</Button>
          ) : (
            <div className="flex flex-row gap-2">
              <Button
                icon={<LeftArrowLong color="grey-04" />}
                variant="secondary"
                onClick={() => setMergeEntityStep('mergeReview')}
              >
                Back
              </Button>
              <Button
                onClick={() => {
                  handlePublish();
                }}
              >
                Merge and Publish
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 h-full overflow-y-auto overscroll-contain rounded-t-[16px] bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pb-20 pt-10 xl:pb-[4ch] xl:pl-[2ch] xl:pr-[2ch] xl:pt-[40px]">
          {mergeEntityStep === 'mergeReview' ? (
            <Tabs.Root defaultValue="entityMergeSelect">
              <Tabs.List
                className="flex flex-row gap-6 border-b border-grey-02 pb-2"
                aria-label="Select entities to merge and preview changes"
              >
                <Tabs.Trigger
                  className="text-quoteMedium text-grey-04 data-[state=active]:text-text"
                  value="entityMergeSelect"
                >
                  Select what to merge
                </Tabs.Trigger>
                <Tabs.Trigger
                  className="text-quoteMedium text-grey-04 data-[state=active]:text-text"
                  value="entityMergePreview"
                >
                  Preview entity
                </Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="entityMergeSelect">
                <div className="grid w-full grid-cols-2 gap-4 pt-10">
                  <div className="flex flex-col gap-3">
                    <Text className="text-bold truncate text-mediumTitle sm:text-smallTitle">
                      {entityOneTriples[0]?.entityName ?? entityIdOne}
                    </Text>
                    <div className="flex flex-row items-center gap-2 pb-6 ">
                      {spaceEntityOne?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] !== undefined && (
                        <div className="relative h-[16px] w-[16px] overflow-hidden rounded-xs">
                          <Image
                            src={getImagePath(spaceEntityOne?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE])}
                            layout="fill"
                            objectFit="cover"
                          />
                        </div>
                      )}
                      <Text variant="metadata">{spaceEntityOne?.attributes[SYSTEM_IDS.NAME]}</Text>
                    </div>
                    <MergeEntityReviewPage
                      entityId={entityIdOne}
                      triples={entityOneTriples}
                      selectedEntityKeys={selectedEntityKeys}
                      onSelect={handleCheckboxSelect}
                      mergedEntityId={mergedEntityId}
                      setMergedEntityId={setMergedEntityId}
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    <Text className="text-bold truncate text-mediumTitle  sm:text-smallTitle">
                      {entityTwoTriples[0]?.entityName ?? entityIdTwo}
                    </Text>
                    <div className="flex flex-row items-center gap-2 pb-6 ">
                      {spaceEntityTwo?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] !== undefined && (
                        <div className="relative h-[16px] w-[16px] overflow-hidden rounded-xs">
                          <Image
                            src={getImagePath(spaceEntityTwo?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE])}
                            layout="fill"
                            objectFit="cover"
                          />
                        </div>
                      )}
                      <Text variant="metadata">{spaceEntityTwo?.attributes[SYSTEM_IDS.NAME]}</Text>
                    </div>
                    <MergeEntityReviewPage
                      entityId={entityIdTwo}
                      triples={entityTwoTriples}
                      selectedEntityKeys={selectedEntityKeys}
                      onSelect={handleCheckboxSelect}
                      mergedEntityId={mergedEntityId}
                      setMergedEntityId={setMergedEntityId}
                    />
                  </div>
                </div>
              </Tabs.Content>
              <Tabs.Content value="entityMergePreview">
                <div className="pt-10">
                  <div className="flex flex-col gap-3">
                    <Text className="text-bold text-mediumTitle sm:text-smallTitle">
                      {mergedEntityTriples[0]?.entityName ?? mergedEntityId}
                    </Text>
                    <div className="flex flex-row items-center gap-2 pb-6">
                      {spaceEntityOne?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] !== undefined && (
                        <div className="relative h-[16px] w-[16px] overflow-hidden rounded-xs">
                          <Image
                            src={getImagePath(spaceEntityOne?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE])}
                            layout="fill"
                            objectFit="cover"
                          />
                        </div>
                      )}
                      <Text variant="metadata">{spaceEntityOne?.attributes[SYSTEM_IDS.NAME]}</Text>
                    </div>
                    <MergeEntityPreviewPage entityId={mergedEntityId} triples={mergedEntityTriples} />
                  </div>
                </div>
              </Tabs.Content>
            </Tabs.Root>
          ) : (
            <>
              <div className="mb-8 flex flex-col rounded border border-grey-02 px-5 py-4">
                <div className="flex flex-row items-center gap-2 pb-3">
                  {spaceEntityOne?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] !== undefined && (
                    <div className="relative h-[16px] w-[16px] overflow-hidden rounded-xs">
                      <Image
                        src={getImagePath(spaceEntityOne?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE])}
                        layout="fill"
                        objectFit="cover"
                      />
                    </div>
                  )}
                  <Text variant="metadata">{spaceEntityOne?.attributes[SYSTEM_IDS.NAME]}</Text>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex flex-row items-center gap-3 bg-bg">
                    <CheckCircleReview color="grey-04" />
                    <Text>Delete triples</Text>
                  </div>
                  <div className="flex flex-row items-center gap-3">
                    <CheckCircleReview color="grey-04" />
                    <Text>Update triples</Text>
                  </div>
                  <div className="flex flex-row items-center gap-3">
                    <CheckCircleReview color="grey-04" />
                    <Text>Find and replace all references</Text>
                  </div>
                </div>
              </div>
              <div>
                <div className="mb-5 flex flex-col">
                  <Text>Merged entity</Text>
                  <Text variant="mediumTitle" className="text-bold">
                    {mergedEntityTriples[0]?.entityName ?? mergedEntityId}
                  </Text>
                </div>
                <MergeEntityPreviewPage entityId={mergedEntityId} triples={mergedEntityTriples} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
