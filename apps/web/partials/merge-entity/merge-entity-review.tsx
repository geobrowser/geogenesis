import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/legacy/image';

import { useEntityPageStore } from '~/core/hooks/use-entity-page-store';
import { useSpaces } from '~/core/hooks/use-spaces';
import { Services } from '~/core/services';
import { useMergeEntity } from '~/core/state/merge-entity-store';
import { getImagePath } from '~/core/utils/utils';

import { Button, SquareButton } from '~/design-system/button';
import { SlideUp } from '~/design-system/slide-up';
import { Text } from '~/design-system/text';

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

  function useEntityById(entityId: string) {
    const { data: entityTwoData, isLoading: entityTwoDataLoading } = useQuery({
      queryKey: ['entity-merge-review', entityIdTwo],
      queryFn: async () => {
        if (!entityIdTwo) return null;
        return await subgraph.fetchEntity({ endpoint: config.subgraph, id: entityIdTwo });
      },
    });
    return entityTwoData;
  }

  const { triples: entityOneTriples } = useEntityPageStore(); // triples from entity page

  const entityTwoTriples = useEntityById(entityIdTwo); // triples from subgraph for second entity @TODO merge with local data since there could be changes
  const { spaces } = useSpaces();
  const spaceEntityOne = spaces.find(space => space.id === entityOneTriples[0]?.space);
  const spaceEntityTwo = spaces.find(space => space.id === entityTwoTriples?.nameTripleSpace);

  if (!entityTwoTriples) return <div>Loading...</div>;
  console.log('entity one triples: ', entityOneTriples);
  console.log('entity two triples: ', entityTwoTriples);

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
      <div className="mt-3 rounded-t-[16px] bg-bg shadow-big h-full ">
        <div className="mx-auto max-w-[1200px] pt-10 pb-20 xl:pt-[40px] xl:pr-[2ch] xl:pb-[4ch] xl:pl-[2ch] ">
          <div className="flex flex-row sm:flex-col items-center justify-between gap-4 w-full">
            <div className="flex flex-col gap-3">
              <Text className="text-bold text-mediumTitle sm:text-smallTitle">
                {entityOneTriples[0]?.entityName ?? entityIdOne}
              </Text>
              <div className="flex flex-row items-center gap-2">
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
            </div>
            <div className="flex flex-col gap-3">
              <Text className="text-bold text-mediumTitle sm:text-smallTitle">
                {entityTwoTriples?.name ?? entityIdTwo}
              </Text>
              <div className="flex flex-row items-center gap-2">
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
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
