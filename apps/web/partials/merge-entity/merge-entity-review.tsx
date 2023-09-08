import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/legacy/image';

import * as React from 'react';

import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { useSpaces } from '~/core/hooks/use-spaces';
import { Services } from '~/core/services';
import { useMergeEntity } from '~/core/state/merge-entity-store';
import { Triple } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';

import { Button, SquareButton } from '~/design-system/button';
import { SlideUp } from '~/design-system/slide-up';
import { Text } from '~/design-system/text';

import { MergeEntityPreviewPage } from './merge-entity-preview-page';
import { MergeEntityReviewPage } from './merge-entity-review-page';

export function MergeEntityReview() {
  const { isMergeReviewOpen, setIsMergeReviewOpen } = useMergeEntity();
  return (
    <SlideUp isOpen={isMergeReviewOpen} setIsOpen={setIsMergeReviewOpen}>
      <div className="h-full overflow-y-auto overscroll-contain">
        <MergeEntityReviewChanges />
      </div>
    </SlideUp>
  );
}

function MergeEntityReviewChanges() {
  const { setIsMergeReviewOpen, entityIdOne, entityIdTwo } = useMergeEntity();

  console.log(`entityIdOne: ${entityIdOne} - entityIdTwo: ${entityIdTwo}`);
  const { subgraph, config } = Services.useServices();
  const [selectedEntityKeys, setSelectedEntityKeys] = React.useState<Record<string, Triple | Triple[]>>({});
  const [mergedEntityId, setMergedEntityId] = React.useState<string>(entityIdOne);
  const [mergedEntityObject, setMergedEntityObject] = React.useState({});

  // function handleCheckboxSelect({
  //   attributeId,
  //   selectedTriple,
  // }: {
  //   attributeId: string;
  //   selectedTriple: Triple | Triple[];
  // }) {

  //   if (selectedEntityKeys[attributeId] && selectedEntityKeys[attributeId].entityId === selectedTriple.entityId) {
  //     // Deselecting the current selection
  //     const newSelectedKeys = { ...selectedEntityKeys };
  //     delete newSelectedKeys[attributeId];
  //     setSelectedEntityKeys(newSelectedKeys);
  //   } else {
  //     setSelectedEntityKeys({
  //       ...selectedEntityKeys,
  //       [attributeId]: selectedTriple,
  //     });
  //   }
  // }

  function handleCheckboxSelect({
    attributeId,
    selectedTriple,
  }: {
    attributeId: string;
    selectedTriple: Triple | Triple[];
  }) {
    const newSelectedKeys = { ...selectedEntityKeys };
    const currentSelection = selectedEntityKeys[attributeId];

    // Handle array type for attributeId === 'type'
    if (attributeId === 'type') {
      // If currentSelection is already an array
      if (Array.isArray(currentSelection)) {
        if (Array.isArray(selectedTriple)) {
          // If both current and new selections are arrays, merge and deduplicate them
          const mergedTriples = [...new Set([...currentSelection, ...selectedTriple])];
          newSelectedKeys[attributeId] = mergedTriples;
        } else {
          // If current is an array and new is a single Triple
          const index = currentSelection.findIndex(triple => triple.entityId === selectedTriple.entityId);
          if (index !== -1) {
            // If already selected, deselect
            currentSelection.splice(index, 1);
          } else {
            // If not selected, add to the list
            currentSelection.push(selectedTriple);
          }
        }
      } else {
        // If currentSelection is not an array, directly set it as the new selection
        newSelectedKeys[attributeId] = selectedTriple;
      }
    } else {
      // For non-type attributes, handle as before
      const extractEntityId = (selection: Triple | Triple[]): string => {
        if (Array.isArray(selection)) {
          return selection[0].entityId; // Assuming non-empty array
        } else {
          return selection.entityId;
        }
      };
      if (currentSelection && extractEntityId(currentSelection) === extractEntityId(selectedTriple)) {
        delete newSelectedKeys[attributeId];
      } else {
        newSelectedKeys[attributeId] = selectedTriple;
      }
    }

    setSelectedEntityKeys(newSelectedKeys);
  }

  function useEntityById(entityId: string) {
    const {
      data: entityTwoData,
      isLoading,
      error,
    } = useQuery({
      queryKey: ['entity-merge-review', entityIdTwo],
      queryFn: async () => {
        if (!entityId) return null;
        return await subgraph.fetchEntity({ endpoint: config.subgraph, id: entityId });
      },
    });
    if (!entityTwoData || isLoading || error) {
      return [];
    }
    return [entityTwoData].flatMap((entity => entity?.triples) ?? []);
  }

  const { triples: entityOneTriples } = useEntityPageStore(); // triples from entity page

  //  triples from subgraph for second entity
  //  @TODO merge with local data since there could be changes
  const entityTwoTriples = useEntityById(entityIdTwo);

  const { spaces } = useSpaces();
  const spaceEntityOne = spaces.find(space => space.id === entityOneTriples[0]?.space);
  const spaceEntityTwo = spaces.find(space => space.id === entityTwoTriples[0]?.space);

  if (!entityTwoTriples) return <div>Loading...</div>;
  console.log('entity one triples: ', entityOneTriples);
  console.log('entity two triples: ', entityTwoTriples);

  // this component has a decent amount of repetition that can likely be abstracted after
  // the functionality is in place

  console.log('selected entity keys', selectedEntityKeys);
  const mergedEntityTriples = Object.values(selectedEntityKeys ?? {}).flat();

  console.log('merged entity triples', mergedEntityTriples);

  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white py-1 px-4 shadow-big md:py-3 md:px-4">
        <div className="inline-flex items-center gap-4">
          <SquareButton onClick={() => setIsMergeReviewOpen(false)} icon="close" />
          <Text variant="metadataMedium">Merge entities</Text>
        </div>
        <div>
          <Button onClick={() => console.log('review')}>Review</Button>
        </div>
      </div>
      <div className="mt-3 rounded-t-[16px] bg-bg shadow-big h-full">
        <div className="mx-auto max-w-[1200px] pt-10 pb-20 xl:pt-[40px] xl:pr-[2ch] xl:pb-[4ch] xl:pl-[2ch]">
          <Tabs.Root defaultValue="entityMergeSelect">
            <Tabs.List
              className="flex flex-row gap-6 border-b border-grey-02 pb-2"
              aria-label="Select entities to merge and preview changes"
            >
              <Tabs.Trigger
                className="data-[state=active]:text-text text-grey-04 text-quoteMedium"
                value="entityMergeSelect"
              >
                Select what to merge
              </Tabs.Trigger>
              <Tabs.Trigger
                className="data-[state=active]:text-text text-grey-04 text-quoteMedium"
                value="entityMergePreview"
              >
                Preview entity
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="entityMergeSelect">
              <div className="grid grid-cols-2 gap-4 w-full pt-10">
                <div className="flex flex-col gap-3">
                  <Text className="text-bold text-mediumTitle sm:text-smallTitle">
                    {entityOneTriples[0]?.entityName ?? entityIdOne}
                  </Text>
                  <div className="flex flex-row items-center gap-2 pb-6">
                    {spaceEntityOne?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] !== undefined && (
                      <div className="relative w-[16px] h-[16px] rounded-xs overflow-hidden">
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
                  <Text className="text-bold text-mediumTitle sm:text-smallTitle">
                    {entityTwoTriples[0]?.entityName ?? entityIdTwo}
                  </Text>
                  <div className="flex flex-row items-center gap-2 pb-6">
                    {spaceEntityTwo?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] !== undefined && (
                      <div className="relative w-[16px] h-[16px] rounded-xs overflow-hidden">
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
                    {/* {entityOneTriples[0]?.entityName ?? entityIdOne} */}
                    New entity
                  </Text>
                  <div className="flex flex-row items-center gap-2 pb-6">
                    {spaceEntityOne?.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] !== undefined && (
                      <div className="relative w-[16px] h-[16px] rounded-xs overflow-hidden">
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
        </div>
      </div>
    </>
  );
}
