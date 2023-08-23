import { Publish } from '~/core/io';
import { useMoveEntity } from '~/core/state/move-entity-store';

import { Button, SquareButton } from '~/design-system/button';
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
        <p>space from: {spaceIdFrom}</p>
        <p>space to: {spaceIdTo}</p>
        <p>entity id: {entityId}</p>
      </div>
    </>
  );
}
