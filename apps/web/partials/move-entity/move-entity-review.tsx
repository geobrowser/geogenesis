import { useMoveEntity } from '~/core/state/move-entity-store';

import { Button, SquareButton } from '~/design-system/button';
import { Icon } from '~/design-system/icon';
import { SlideUp } from '~/design-system/slide-up';
import { Text } from '~/design-system/text';

export function MoveEntityReview() {
  const { isMoveReviewOpen, setIsMoveReviewOpen } = useMoveEntity();
  return (
    <SlideUp isOpen={isMoveReviewOpen} setIsOpen={setIsMoveReviewOpen}>
      <MoveEntityReviewChanges />
    </SlideUp>
  );
}

function MoveEntityReviewChanges() {
  const { spaceIdFrom, spaceIdTo, entityId, setIsMoveReviewOpen } = useMoveEntity();
  return (
    <>
      <div className="flex w-full items-center justify-between gap-1 bg-white py-1 px-4 shadow-big md:py-3 md:px-4">
        <div className="inline-flex items-center gap-4">
          <SquareButton onClick={() => setIsMoveReviewOpen(false)} icon="close" />
          <Text variant="metadataMedium">Move entities</Text>
        </div>
        <div>
          <Button onClick={() => console.log('publish and move!')}>Publish and move</Button>
        </div>
      </div>
      <div className="mt-3 h-full overflow-y-auto overscroll-contain rounded-t-[16px] bg-bg shadow-big">
        <div className="mx-auto max-w-[1200px] pt-10 pb-20 xl:pt-[40px] xl:pr-[2ch] xl:pb-[4ch] xl:pl-[2ch]">
          <div className="flex flex-row items-center justify-between gap-4 w-full ">
            <SpaceMoveCard spaceName="Space Name" spaceImage="" actionType="delete" />
            <Icon icon="rightArrowLongSmall" color="grey-04" />
            <SpaceMoveCard spaceName="Space Name" spaceImage="" actionType="create" />
          </div>
        </div>
      </div>
    </>
  );
}

function SpaceMoveCard({
  spaceName,
  spaceImage,
  actionType,
}: {
  spaceName: string;
  spaceImage: string;
  actionType: 'delete' | 'create';
}) {
  return (
    <div className="flex flex-col border border-grey-02 rounded px-4 py-5 basis-3/5 w-full max-h-[90px]">
      <div className="flex flex-row items-center gap-2">
        <div className="bg-purple w-4 h-4 rounded-sm"></div>
        <Text variant="metadata">{spaceName}</Text>
      </div>
      <div className="flex flex-row items-center py-4 gap-2">
        <Icon icon="checkCircle" color="grey-04" />
        <Text variant="metadata">{actionType === 'delete' ? 'Delete triples' : 'Create triples'}</Text>
      </div>
    </div>
  );
}

/* <p>space from: {spaceIdFrom}</p>
<p>space to: {spaceIdTo}</p>
<p>entity id: {entityId}</p> */
